/**
 * Phase 10.2: Email-notification wiring.
 *
 * The Notification model is the source of truth ("did the user get told"),
 * and Phase 9 / Workstream G already pins the in-app delivery path. This
 * file pins the email side of the same flow:
 *
 *   - sendEmail is a no-op (returns { sent: false }) when SMTP is unset.
 *   - When SMTP is set, sendEmail invokes nodemailer.createTransport()
 *     and sendMail() with the right envelope.
 *   - notifyInstitutionAdmins (driven through the Stripe webhook) emails
 *     every admin alongside the in-app Notification row.
 *   - A nodemailer transport failure does NOT abort the webhook flow —
 *     the in-app Notification row is still written.
 *   - renderBillingEmail HTML-escapes user-controlled strings so a tier
 *     name returned from the DB can't inject markup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted nodemailer mock — every test runs against the same fake.
const { sendMailMock, createTransportMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(async () => ({ messageId: 'test-id' })),
  createTransportMock: vi.fn(),
}));
vi.mock('nodemailer', () => {
  createTransportMock.mockImplementation(() => ({ sendMail: sendMailMock }));
  return {
    default: { createTransport: createTransportMock },
    createTransport: createTransportMock,
  };
});

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendEmail, __resetEmailTransportForTests } from '../lib/email';
import { renderBillingEmail } from '../lib/email-templates';

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_SECURE'] as const;
const savedEnv: Partial<Record<(typeof SMTP_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of SMTP_KEYS) savedEnv[k] = process.env[k];
  for (const k of SMTP_KEYS) delete process.env[k];
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: 'test-id' });
  createTransportMock.mockClear();
  __resetEmailTransportForTests();
});

afterEach(() => {
  for (const k of SMTP_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  __resetEmailTransportForTests();
});

describe('sendEmail — transport selection', () => {
  it('returns { sent: false } and does not build a transport when SMTP_HOST is unset', async () => {
    const result = await sendEmail({ to: 'a@b.test', subject: 's', text: 't' });
    expect(result).toEqual({ sent: false, reason: 'smtp_not_configured' });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns { sent: false } when SMTP_HOST is set but SMTP_FROM/USER is not', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    const result = await sendEmail({ to: 'a@b.test', subject: 's', text: 't' });
    expect(result).toEqual({ sent: false, reason: 'smtp_not_configured' });
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('builds a transport and sends when SMTP is fully configured', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'apikey';
    process.env['SMTP_PASSWORD'] = 'secret';
    process.env['SMTP_FROM'] = 'HERM <noreply@example.com>';

    const result = await sendEmail({
      to: 'admin@inst.test',
      subject: 'Payment failed',
      text: 'Body',
      html: '<p>Body</p>',
    });

    expect(result).toEqual({ sent: true });
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: 'secret' },
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'HERM <noreply@example.com>',
      to: 'admin@inst.test',
      subject: 'Payment failed',
      text: 'Body',
      html: '<p>Body</p>',
    });
  });

  it('infers secure=true when SMTP_PORT is 465 (SMTPS)', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_PORT'] = '465';
    process.env['SMTP_FROM'] = 'a@b.test';
    await sendEmail({ to: 'x@y.test', subject: 's', text: 't' });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('honours an explicit SMTP_SECURE=true override on a non-465 port', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_PORT'] = '2525';
    process.env['SMTP_SECURE'] = 'true';
    process.env['SMTP_FROM'] = 'a@b.test';
    await sendEmail({ to: 'x@y.test', subject: 's', text: 't' });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 2525, secure: true }),
    );
  });

  it('joins multi-recipient `to` arrays into a single comma-separated header', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM'] = 'a@b.test';
    await sendEmail({ to: ['a@x.test', 'b@x.test'], subject: 's', text: 't' });
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.test, b@x.test' }));
  });

  it('returns { sent: false, reason: "send_failed" } and never throws when nodemailer rejects', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM'] = 'a@b.test';
    sendMailMock.mockRejectedValueOnce(new Error('relay timeout'));
    const result = await sendEmail({ to: 'x@y.test', subject: 's', text: 't' });
    expect(result).toEqual({ sent: false, reason: 'send_failed' });
  });

  it('reuses a single transport across multiple sends with the same config', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM'] = 'a@b.test';
    await sendEmail({ to: 'x@y.test', subject: 's1', text: 't1' });
    await sendEmail({ to: 'x@y.test', subject: 's2', text: 't2' });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an out-of-range SMTP_PORT and disables email rather than connecting to a bogus port', async () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM'] = 'a@b.test';
    process.env['SMTP_PORT'] = '99999';
    const result = await sendEmail({ to: 'x@y.test', subject: 's', text: 't' });
    expect(result).toEqual({ sent: false, reason: 'smtp_not_configured' });
    expect(createTransportMock).not.toHaveBeenCalled();
  });
});

describe('renderBillingEmail', () => {
  it('produces a text body containing the message and a deep link when provided', () => {
    const { text } = renderBillingEmail({
      title: 'Payment failed',
      message: 'We were unable to charge your card.',
      link: '/subscription',
    });
    expect(text).toContain('Payment failed');
    expect(text).toContain('We were unable to charge your card.');
    expect(text).toContain('/subscription');
  });

  it('omits the View-details block when no link is given', () => {
    const { text, html } = renderBillingEmail({
      title: 'Tier change',
      message: 'Tier updated.',
    });
    expect(text).not.toMatch(/View details/);
    expect(html).not.toMatch(/View details/);
  });

  it('HTML-escapes user-controlled strings so DB content cannot inject markup', () => {
    const { html } = renderBillingEmail({
      title: 'Tier <script>alert(1)</script>',
      message: 'Subject "quoted" & <b>bold</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).toContain('&amp;');
  });
});
