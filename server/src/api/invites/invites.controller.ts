import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/prisma';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/email';
import { PRODUCT } from '../../lib/branding';
import { recordUsage } from '../../middleware/enforceQuota';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';

/**
 * Phase 16.5 — team-member invitations.
 *
 * Closes the previously-skipped `team.members` quota path. Three endpoints:
 *
 *   POST /api/admin/users/invite           Admin-only. Creates Invite row +
 *                                          emails recipient a claim link.
 *                                          Gated by `enforceQuota('team.members')`
 *                                          mounted on the route. NOTE: quota
 *                                          counts ACTIVE members (User rows),
 *                                          not pending invites — the gate
 *                                          here is a pre-check so the admin
 *                                          can't queue more invites than
 *                                          there are seats left.
 *
 *   GET  /api/invites/:token               Public. Returns the invite shape
 *                                          (email, institution name, role)
 *                                          for the claim page to render.
 *                                          404 on unknown / expired /
 *                                          already-claimed tokens.
 *
 *   POST /api/invites/:token/claim         Public. Body `{name, password}`.
 *                                          Creates User row, marks invite
 *                                          claimed, records usage, returns
 *                                          {token, user} for auto-login.
 *
 * Token model
 * - 32 random bytes → base64url → 43-char URL-safe string sent in email.
 * - The DB stores ONLY a SHA-256 hash of the token (`tokenHash`, unique).
 *   Lookup hashes the inbound token and queries by hash.
 * - Expiry: 7 days from creation. The claim endpoint rejects expired rows.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const JWT_TTL = '7d';

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim().max(254),
  role: z.enum(['VIEWER', 'EVALUATOR', 'PROCUREMENT_LEAD', 'FINANCE', 'INSTITUTION_ADMIN']),
});

const claimSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  password: z.string().min(12, 'Password must be at least 12 characters').max(200),
});

function generateToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export async function createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = inviteSchema.parse(req.body);
    const { institutionId, userId } = req.user!;

    // Reject if a User with this email already exists in this institution.
    // (Existing in another tenant is fine — emails are globally unique but
    //  the conflict would surface at claim time.)
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email, institutionId, deletedAt: null },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictError('A user with this email is already a member of your institution.');
    }

    // Reject if an outstanding (unclaimed, unexpired) invite already exists.
    const existingInvite = await prisma.invite.findFirst({
      where: {
        email: data.email,
        institutionId,
        claimedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (existingInvite) {
      throw new ConflictError('A pending invite already exists for this email. Revoke it or wait for it to expire (7 days).');
    }

    const { plain, hash } = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await prisma.invite.create({
      data: {
        email: data.email,
        institutionId,
        role: data.role,
        tokenHash: hash,
        expiresAt,
        createdById: userId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    // Email the claim link. APP_URL is the public-facing SPA origin;
    // fallback to localhost for dev. The claim page reads ?token=...
    // from the query string and calls GET /api/invites/:token to
    // render the form.
    const appUrl = process.env['APP_URL'] ?? process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
    const claimUrl = `${appUrl}/claim?token=${encodeURIComponent(plain)}`;

    const emailResult = await sendEmail({
      to: data.email,
      subject: `You've been invited to ${PRODUCT.name}`,
      text: [
        `${req.user!.name} has invited you to join ${req.user!.institutionName} on ${PRODUCT.name}.`,
        ``,
        `Click the link below to set your password and finish setting up your account:`,
        ``,
        claimUrl,
        ``,
        `This invite expires in 7 days. If you weren't expecting this email, you can safely ignore it — your inbox isn't on file with us and nothing will be created until you click the link.`,
        ``,
        `— ${PRODUCT.name}`,
      ].join('\n'),
    });

    await audit(req, {
      action: 'admin.invite.create',
      entityType: 'Invite',
      entityId: invite.id,
      userId,
      changes: {
        email: data.email,
        role: data.role,
        emailSent: emailResult.sent,
      },
    });

    if (!emailResult.sent) {
      // Don't 5xx the request — the invite row exists in the DB, the
      // admin can resend or share the URL manually. Log loudly so an
      // SMTP misconfiguration gets operator attention.
      logger.warn(
        { inviteId: invite.id, institutionId, reason: emailResult.reason },
        'Invite created but email delivery failed',
      );
    }

    res.status(201).json({
      success: true,
      data: {
        invite,
        emailSent: emailResult.sent,
        // Returned ONLY in this response so the admin UI can show
        // "copy invite link" if email isn't configured. Not persisted
        // server-side.
        claimUrl: emailResult.sent ? undefined : claimUrl,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getInviteByToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.params['token'] ?? '';
    if (!token) throw new NotFoundError('Invite not found.');
    const tokenHash = hashToken(token);
    const invite = await prisma.invite.findUnique({
      where: { tokenHash },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        claimedAt: true,
        institution: { select: { name: true } },
      },
    });
    if (!invite) throw new NotFoundError('Invite not found or already claimed.');
    if (invite.claimedAt) throw new NotFoundError('Invite has already been claimed.');
    if (invite.expiresAt < new Date()) throw new NotFoundError('Invite has expired. Ask your admin to send a new one.');
    res.json({
      success: true,
      data: {
        email: invite.email,
        role: invite.role,
        institutionName: invite.institution.name,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function claimInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.params['token'] ?? '';
    if (!token) throw new NotFoundError('Invite not found.');
    const data = claimSchema.parse(req.body);
    const tokenHash = hashToken(token);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        role: true,
        institutionId: true,
        expiresAt: true,
        claimedAt: true,
        institution: { select: { name: true } },
      },
    });
    if (!invite) throw new NotFoundError('Invite not found.');
    if (invite.claimedAt) throw new ConflictError('Invite has already been claimed.');
    if (invite.expiresAt < new Date()) throw new ValidationError('Invite has expired. Ask your admin to send a new one.');

    // Defence-in-depth: a concurrent self-registration with the same
    // email would have created a User row in the same institution between
    // invite creation and claim. Block that explicitly rather than fail
    // at the unique-email constraint.
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictError('An account with this email already exists. Sign in instead.');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Atomic create-user + mark-claimed in a single transaction so a
    // failure after user-create doesn't leave an orphan account that
    // doubles as a successful invite.
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: invite.email,
          name: data.name,
          passwordHash,
          role: invite.role,
          institutionId: invite.institutionId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          institutionId: true,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { claimedAt: new Date(), claimedById: newUser.id },
      });
      return newUser;
    });

    // Quota counts ACTIVE members (User rows), not invites. Record the
    // increment now — after the durable User write — so quota stays
    // accurate even if the email send below fails.
    await recordUsage(invite.institutionId, 'team.members');

    await audit(req, {
      action: 'admin.invite.claim',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      changes: {
        inviteId: invite.id,
        email: user.email,
        role: user.role,
        institutionId: invite.institutionId,
      },
    });

    // Mint a session JWT so the claim page can drop the user straight
    // into the dashboard rather than bouncing through /login. Tier on
    // the claim is derived from the institution's subscription tier —
    // omitted here; the standard /auth/login flow resolves it on next
    // login. For the auto-login post-claim, we mint with a placeholder
    // tier that authenticateJWT will refresh on the first authenticated
    // request via the existing /auth/me endpoint.
    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      // Should be impossible (env-check enforces at boot); guard for tests
      throw new Error('JWT_SECRET not configured');
    }
    const sessionToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        institutionId: user.institutionId,
        institutionName: invite.institution.name,
        tier: 'free',
      },
      jwtSecret,
      { expiresIn: JWT_TTL },
    );

    res.status(201).json({
      success: true,
      data: {
        token: sessionToken,
        user: {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          institutionId: user.institutionId,
          institutionName: invite.institution.name,
          tier: 'free',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const inviteId = req.params['id'] ?? '';
    const { institutionId, userId } = req.user!;
    const invite = await prisma.invite.findFirst({
      where: { id: inviteId, institutionId, claimedAt: null },
      select: { id: true, email: true },
    });
    if (!invite) throw new NotFoundError('Pending invite not found in your institution.');
    await prisma.invite.delete({ where: { id: invite.id } });
    await audit(req, {
      action: 'admin.invite.revoke',
      entityType: 'Invite',
      entityId: invite.id,
      userId,
      changes: { email: invite.email },
    });
    res.json({ success: true, data: { revoked: true } });
  } catch (err) {
    next(err);
  }
}

export async function listPendingInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { institutionId } = req.user!;
    const invites = await prisma.invite.findMany({
      where: { institutionId, claimedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: invites });
  } catch (err) {
    next(err);
  }
}
