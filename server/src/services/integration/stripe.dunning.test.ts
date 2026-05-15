/**
 * Tests for the new Stripe webhook event handlers added in Workstream G:
 *   - invoice.payment_failed   → dunningState=past_due + Payment(status=failed) + admin notification
 *   - invoice.payment_succeeded → dunningState=past_due→active (recovery) + Payment(status=succeeded) + admin notification
 *   - customer.subscription.updated → tier reconciliation from price ID + admin notification
 *   - charge.refunded          → Payment(status=refunded) + admin notification
 *   - charge.dispute.created   → dunningState=paused + admin notification
 *   - signature failure        → throws StripeWebhookSignatureError (was silently swallowed)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env BEFORE the service imports — the service captures STRIPE_SECRET_KEY
// and STRIPE_WEBHOOK_SECRET into module-level consts at import time, so they
// must be present when the import runs. vi.hoisted runs before vi.mock and
// before regular module evaluation.
const { constructEvent } = vi.hoisted(() => {
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_xxx';
  process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_xxx';
  process.env['STRIPE_PRICE_INST_PRO'] = 'price_pro';
  process.env['STRIPE_PRICE_INST_PRO_LEGACY'] = 'price_pro_legacy';
  process.env['STRIPE_PRICE_INST_ENT'] = 'price_ent';
  return { constructEvent: vi.fn() };
});

// Mock the stripe SDK BEFORE importing the service. The service does a
// dynamic `require('stripe')` inside getStripe(), so this mock intercepts
// every call site. We control `webhooks.constructEvent` per-test to drive
// each event type without real signature verification.
vi.mock('stripe', () => {
  function MockStripe() {
    return {
      webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) },
      checkout: { sessions: { create: vi.fn() } },
      subscriptions: { list: vi.fn(), cancel: vi.fn() },
      invoices: { list: vi.fn() },
    };
  }
  return { default: MockStripe };
});

// Mock prisma.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    subscription: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      // Phase 16.9 — invoice.payment_succeeded uses upsert keyed on the
      // unique stripePaymentId column. The failed → succeeded transition
      // path requires this (findFirst+create would throw P2002 on the
      // unique constraint).
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
    vendorAccount: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../../utils/prisma', () => ({ default: prismaMock }));

// Quiet logger.
vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock the email sender so the dunning tests don't try to talk to a real
// SMTP server. Each test asserts on `sendEmailMock` to confirm the
// in-app + email split is actually firing both channels.
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../../lib/email', () => ({ sendEmail: sendEmailMock }));

// Import AFTER mocks.
import { handleWebhook, StripeWebhookSignatureError } from './stripe';

beforeEach(() => {
  constructEvent.mockReset();
  prismaMock.subscription.findFirst.mockReset();
  prismaMock.subscription.findUnique.mockReset();
  prismaMock.subscription.update.mockReset();
  prismaMock.payment.create.mockReset();
  prismaMock.payment.upsert.mockReset();
  prismaMock.payment.updateMany.mockReset();
  prismaMock.payment.findFirst.mockReset();
  prismaMock.user.findMany.mockReset();
  prismaMock.notification.createMany.mockReset();
  prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1', email: 'admin-1@inst.test' }]);
  prismaMock.notification.createMany.mockResolvedValue({ count: 1 });
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ sent: true });
});

describe('stripe webhook — signature verification', () => {
  it('throws StripeWebhookSignatureError when constructEvent throws (controller turns into non-200)', async () => {
    // Pre-fix, this case silently returned `{ handled: false }` and the
    // controller responded 200. Stripe would treat the event as ack'd and
    // stop retrying. The bug fix in this PR is the throw — let's lock it.
    constructEvent.mockImplementationOnce(() => {
      throw new Error('Webhook signature verification failed');
    });
    await expect(
      handleWebhook(Buffer.from('payload'), 't=0,v1=fake'),
    ).rejects.toBeInstanceOf(StripeWebhookSignatureError);
  });

  // Note: the "STRIPE_WEBHOOK_SECRET unset → graceful no-op" path is not
  // unit-tested here because the service captures env into module-level
  // consts at import time. That path is covered indirectly by env-check
  // (which now fails the boot when STRIPE_SECRET_KEY is set without
  // STRIPE_WEBHOOK_SECRET in production, and warns in development).
});

describe('stripe webhook — invoice.payment_failed', () => {
  it('flips dunningState to past_due + writes a failed Payment + notifies admins', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_stripe_1',
          amount_due: 5000,
          currency: 'gbp',
          payment_intent: 'pi_failed_1',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_1',
      institutionId: 'inst-1',
    });

    const res = await handleWebhook(Buffer.from('payload'), 'sig');

    expect(res).toEqual({ handled: true, event: 'invoice.payment_failed' });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_1' },
      data: { dunningState: 'past_due' },
    });
    expect(prismaMock.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: 'sub_db_1',
          amount: 50,
          currency: 'GBP',
          status: 'failed',
          stripePaymentId: 'pi_failed_1',
          paidAt: null,
        }),
      }),
    );
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: 'inst-1', role: 'INSTITUTION_ADMIN' } }),
    );
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it('is a no-op when the subscription id does not match a row (unknown remote)', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_unknown', amount_due: 5000, currency: 'gbp' } },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    await handleWebhook(Buffer.from('payload'), 'sig');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

// Phase 16.9 — successful renewal recovers a past_due subscription.
// Pins the auto-recovery contract: dunningState flips back to 'active',
// a Payment row is upserted (unique on stripePaymentId so replays +
// failed→succeeded transitions are both safe), admins are notified
// only on the past_due → active transition, and terminal states
// ('cancelled', 'paused') are NOT overwritten by a late-arriving event.
describe('stripe webhook — invoice.payment_succeeded', () => {
  it('flips dunningState past_due → active + upserts a succeeded Payment + notifies admins', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub_stripe_recovered',
          amount_paid: 5000,
          currency: 'gbp',
          payment_intent: 'pi_recovered_1',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_recovered',
      institutionId: 'inst-1',
      dunningState: 'past_due',
    });

    const res = await handleWebhook(Buffer.from('payload'), 'sig');

    expect(res).toEqual({ handled: true, event: 'invoice.payment_succeeded' });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_recovered' },
      data: { dunningState: 'active', status: 'active' },
    });
    // Payment.stripePaymentId is @unique — upsert keyed on it handles
    // both the fresh-payment path and the failed→succeeded transition
    // path without throwing P2002. The `update` clause overwrites the
    // prior 'failed' row (Stripe settled the charge — that's the truth now).
    expect(prismaMock.payment.upsert).toHaveBeenCalledWith({
      where: { stripePaymentId: 'pi_recovered_1' },
      create: expect.objectContaining({
        subscriptionId: 'sub_db_recovered',
        amount: 50,
        currency: 'GBP',
        status: 'succeeded',
        stripePaymentId: 'pi_recovered_1',
      }),
      update: expect.objectContaining({
        status: 'succeeded',
        amount: 50,
        currency: 'GBP',
      }),
    });
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it('does NOT notify admins for a routine renewal (subscription was already active)', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub_stripe_active',
          amount_paid: 5000,
          currency: 'gbp',
          payment_intent: 'pi_routine_1',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_active',
      institutionId: 'inst-2',
      dunningState: 'active', // already active — no transition signal
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_active' },
      data: { dunningState: 'active', status: 'active' },
    });
    expect(prismaMock.payment.upsert).toHaveBeenCalled();
    // No admin notification on the routine path — would be email noise.
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it('upsert is idempotent on Stripe replay — second delivery produces no new Payment row', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub_stripe_replay',
          amount_paid: 5000,
          currency: 'gbp',
          payment_intent: 'pi_replay_1',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_replay',
      institutionId: 'inst-3',
      dunningState: 'active',
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    // The upsert path is the idempotency guarantee — DB-side the
    // `update` clause runs on replay, producing no new row. We
    // assert the call shape; the database's own behaviour is the
    // contract being relied on.
    expect(prismaMock.payment.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePaymentId: 'pi_replay_1' },
      }),
    );
  });

  // Bugbot finding ref1_7f19c0ae — state-machine race protection.
  // Stripe doesn't guarantee webhook ordering; a late-arriving
  // payment_succeeded must NOT undo a cancelled / paused transition
  // set by an earlier customer.subscription.deleted /
  // charge.dispute.created event.
  for (const terminal of ['cancelled', 'paused'] as const) {
    it(`does NOT re-activate a subscription in '${terminal}' state`, async () => {
      constructEvent.mockReturnValueOnce({
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            subscription: 'sub_stripe_terminal',
            amount_paid: 5000,
            currency: 'gbp',
            payment_intent: 'pi_terminal',
          },
        },
      });
      prismaMock.subscription.findFirst.mockResolvedValueOnce({
        id: 'sub_db_terminal',
        institutionId: 'inst-terminal',
        dunningState: terminal,
      });

      await handleWebhook(Buffer.from('payload'), 'sig');

      // Subscription row is NOT touched — the existing terminal
      // state is preserved against this late delivery.
      expect(prismaMock.subscription.update).not.toHaveBeenCalled();
      // Payment row IS upserted — the operator still wants to see
      // that Stripe took the money, even if the subscription is
      // staying in its terminal state.
      expect(prismaMock.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripePaymentId: 'pi_terminal' },
        }),
      );
      // No admin notification either — would be misleading
      // ("payment recovered!" on a cancelled sub).
      expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    });
  }

  it('is a no-op when the subscription id does not match a row (unknown remote)', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: { object: { subscription: 'sub_unknown', amount_paid: 5000, currency: 'gbp' } },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.upsert).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('stripe webhook — customer.subscription.updated', () => {
  it('reconciles tier upward when Stripe price ID maps to a higher tier', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_2',
          items: { data: [{ price: { id: 'price_ent' } }] },
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_2',
      institutionId: 'inst-2',
      tier: 'PRO',
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_2' },
      data: { tier: 'ENTERPRISE' },
    });
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it('is a no-op when the new price ID equals the current tier', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_3',
          items: { data: [{ price: { id: 'price_pro' } }] },
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_3',
      institutionId: 'inst-3',
      tier: 'PRO',
    });
    await handleWebhook(Buffer.from('payload'), 'sig');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('is a no-op for an unrecognised price ID (e.g. one-off charge)', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_4',
          items: { data: [{ price: { id: 'price_unknown' } }] },
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_4',
      institutionId: 'inst-4',
      tier: 'PRO',
    });
    await handleWebhook(Buffer.from('payload'), 'sig');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  // Phase 15.2 — STRIPE_PRICE_INST_PRO_LEGACY safety net. A pre-rebrand
  // price ID still flowing through live Stripe webhooks must resolve to
  // PRO (not fall through as unrecognised) so the tier reconciliation
  // doesn't silently mis-tier the institution during the deploy window.
  it('reconciles the legacy Pro price ID to PRO via STRIPE_PRICE_INST_PRO_LEGACY', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_legacy',
          items: { data: [{ price: { id: 'price_pro_legacy' } }] },
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_legacy',
      institutionId: 'inst-legacy',
      tier: 'FREE',
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_legacy' },
      data: { tier: 'PRO' },
    });
  });
});

describe('stripe webhook — charge.refunded', () => {
  it('marks the matching Payment row as refunded + notifies admins', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: 'pi_charge_1',
          amount_refunded: 5000,
          currency: 'gbp',
        },
      },
    });
    prismaMock.payment.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      subscription: { institutionId: 'inst-5' },
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentId: 'pi_charge_1' },
      data: { status: 'refunded' },
    });
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it('is a no-op when the payment_intent matches no row', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_unknown', amount_refunded: 5000, currency: 'gbp' } },
    });
    prismaMock.payment.updateMany.mockResolvedValueOnce({ count: 0 });
    await handleWebhook(Buffer.from('payload'), 'sig');
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('stripe webhook — charge.dispute.created', () => {
  it('flips dunningState to paused + notifies admins', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'charge.dispute.created',
      data: {
        object: {
          payment_intent: 'pi_disputed_1',
          amount: 5000,
          currency: 'gbp',
        },
      },
    });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      subscription: { id: 'sub_db_6', institutionId: 'inst-6' },
    });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_6' },
      data: { dunningState: 'paused' },
    });
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it('is a no-op when the payment_intent matches no Payment row', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'charge.dispute.created',
      data: { object: { payment_intent: 'pi_unknown', amount: 5000, currency: 'gbp' } },
    });
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);
    await handleWebhook(Buffer.from('payload'), 'sig');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });
});

describe('stripe webhook — email fan-out alongside in-app notifications (Phase 10.2)', () => {
  it('fires sendEmail once per admin with an email, alongside the in-app Notification row', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_stripe_email',
          amount_due: 5000,
          currency: 'gbp',
          payment_intent: 'pi_email_1',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_email',
      institutionId: 'inst-email',
    });
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'admin-a', email: 'a@inst-email.test' },
      { id: 'admin-b', email: 'b@inst-email.test' },
    ]);

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    type EmailCallArg = { to: string; subject: string; text: string; html: string };
    const calls = sendEmailMock.mock.calls as unknown as Array<[EmailCallArg]>;
    const recipients = calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual(['a@inst-email.test', 'b@inst-email.test']);
    for (const [arg] of calls) {
      expect(arg.subject).toBe('Payment failed');
      expect(arg.text).toContain('unable to charge');
      expect(arg.html).toContain('<h1');
    }
  });

  it('skips email when the admin has no email address but still writes the in-app Notification', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_stripe_no_email',
          amount_due: 5000,
          currency: 'gbp',
          payment_intent: 'pi_no_email',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_db_no_email',
      institutionId: 'inst-no-email',
    });
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'admin-no-email', email: null },
    ]);

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('a thrown sendEmail does not abort the webhook — Notification row is still written', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'charge.dispute.created',
      data: {
        object: {
          payment_intent: 'pi_email_throws',
          amount: 5000,
          currency: 'gbp',
        },
      },
    });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      subscription: { id: 'sub_db_throws', institutionId: 'inst-throws' },
    });
    sendEmailMock.mockRejectedValueOnce(new Error('relay timeout'));

    const res = await handleWebhook(Buffer.from('payload'), 'sig');

    expect(res).toEqual({ handled: true, event: 'charge.dispute.created' });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_throws' },
      data: { dunningState: 'paused' },
    });
    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('stripe webhook — checkout.session.completed (regression: dunningState reset)', () => {
  it('resets dunningState to active on a fresh checkout', async () => {
    constructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            tier: 'institutionPro',
            isVendor: 'false',
            institutionId: 'inst-7',
          },
          customer: 'cus_1',
          subscription: 'sub_stripe_7',
          amount_total: 250000,
          currency: 'gbp',
          payment_intent: 'pi_ok_7',
        },
      },
    });
    prismaMock.subscription.findUnique.mockResolvedValueOnce({ id: 'sub_db_7' });

    await handleWebhook(Buffer.from('payload'), 'sig');

    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_db_7' },
      data: expect.objectContaining({
        tier: 'PRO',
        status: 'active',
        dunningState: 'active',
      }),
    });
    expect(prismaMock.payment.create).toHaveBeenCalled();
  });
});
