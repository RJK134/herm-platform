import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendEmail } from '../../lib/email';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { PRODUCT } from '../../lib/branding';

/**
 * Phase 16.14 — Enterprise dedicated-CSM contact request.
 *
 * Subscriptions.tsx promises Enterprise customers a "Dedicated CSM"
 * (Customer Success Manager). That's a process, not a code feature
 * — we don't auto-assign a real human. This endpoint ships the
 * customer-facing surface for the request: collect a brief, email
 * the FHE support team, and write an audit row so the request is
 * tracked even if the email send fails.
 *
 * Gate: route mount uses `authenticateJWT + requirePaidTier(['enterprise'])`
 * so anonymous and Free/Pro users never reach this controller. The
 * server-side gate is the source of truth — the client UI is a mirror.
 */
export const csmRequestSchema = z.object({
  topic: z.enum([
    'kickoff',
    'quarterly-review',
    'tooling-question',
    'roadmap-input',
    'escalation',
    'other',
  ]),
  message: z.string().trim().min(20, 'Please provide at least 20 characters of context')
    .max(2000, 'Message must be 2000 characters or fewer'),
  preferredContactMethod: z.enum(['email', 'phone', 'video-call']).default('email'),
  preferredContactDetail: z.string().trim().min(1).max(200).optional(),
});

export async function submitCsmRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = csmRequestSchema.parse(req.body);
    const user = req.user!;

    const subject = `[CSM] ${data.topic} — ${user.institutionName}`;
    const body = [
      `New Customer Success request from an Enterprise customer.`,
      ``,
      `Institution:   ${user.institutionName} (${user.institutionId})`,
      `Requester:     ${user.name} <${user.email}>`,
      `User role:     ${user.role}`,
      `Topic:         ${data.topic}`,
      `Preferred:     ${data.preferredContactMethod}` +
        (data.preferredContactDetail ? ` (${data.preferredContactDetail})` : ''),
      ``,
      `Message:`,
      data.message,
      ``,
      `— Sent by ${PRODUCT.name}`,
    ].join('\n');

    const emailResult = await sendEmail({
      to: PRODUCT.supportEmail,
      subject,
      text: body,
    });

    // audit() is best-effort — never throws — and runs regardless of
    // email outcome so the request is tracked even when SMTP is down.
    await audit(req, {
      action: 'support.csm-request',
      entityType: 'Institution',
      entityId: user.institutionId,
      userId: user.userId,
      changes: {
        topic: data.topic,
        preferredContactMethod: data.preferredContactMethod,
        emailSent: emailResult.sent,
        emailReason: emailResult.reason,
        messageLength: data.message.length,
      },
    });

    if (!emailResult.sent) {
      // Log loudly so an SMTP misconfiguration in production gets
      // operator attention. The request is already audited, so
      // recovery is "fix SMTP and replay audit log" rather than
      // "lose the request".
      logger.warn(
        { institutionId: user.institutionId, reason: emailResult.reason },
        'CSM request audit recorded but email send failed',
      );
    }

    res.status(202).json({
      success: true,
      data: {
        accepted: true,
        notice: emailResult.sent
          ? 'Your request has been sent to the Customer Success team. We aim to respond within one business day.'
          : 'Your request has been recorded. The team will be in touch within one business day.',
      },
    });
  } catch (err) {
    next(err);
  }
}
