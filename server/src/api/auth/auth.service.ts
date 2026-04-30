import bcrypt from 'bcryptjs';
import prisma from '../../utils/prisma';
import { generateToken, type JwtPayload } from '../../middleware/auth';
import { AppError, ConflictError } from '../../utils/errors';
import type { RegisterInput, LoginInput } from './auth.schema';
import { checkLockout, recordFailure, clearFailures, AccountLockedError } from '../../lib/lockout';
import { generateMfaChallengeToken } from '../../lib/mfa';

// Pre-computed bcrypt hash used when the email doesn't exist in the database.
// Running bcrypt.compare against this dummy hash ensures the response time for
// non-existent emails matches the time for existing emails with a wrong password,
// preventing an attacker from enumerating valid addresses by measuring latency.
// This is a bcrypt hash of the string "dummy-password-placeholder" at cost 10.
const DUMMY_HASH = '$2a$10$HMZm49nwfBLvO2Omv16KtuM8SGCKi5p.9aY6icgaOFJ5rFeJKQFRS';

function buildSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) +
    '-' +
    Date.now().toString(36)
  );
}

// Pre-billing dev flag: every authenticated user behaves as Enterprise.
// Off unless DEV_UNLOCK_ALL_TIERS=true. env-check.ts warns loudly if this is
// ever set in production. Leaves the DB untouched — flipping the flag off
// returns users to their real subscription tier on next login.
export function resolveEffectiveTier(tier: string): string {
  return process.env['DEV_UNLOCK_ALL_TIERS'] === 'true' ? 'enterprise' : tier;
}

export class AuthService {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) throw new ConflictError('Email address already registered');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const slug = buildSlug(data.institutionName);

    const result = await prisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name: data.institutionName,
          slug,
          country: data.institutionCountry ?? 'UK',
          tier: 'free',
        },
      });

      // Create subscription record (FREE tier)
      await tx.subscription.create({
        data: {
          institutionId: institution.id,
          tier: 'FREE',
          status: 'active',
        },
      });

      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name,
          passwordHash,
          role: 'INSTITUTION_ADMIN',
          institutionId: institution.id,
        },
      });

      return { user, institution };
    });

    const payload: JwtPayload = {
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      institutionId: result.institution.id,
      institutionName: result.institution.name,
      tier: resolveEffectiveTier('free'),
    };

    return { token: generateToken(payload), user: payload };
  }

  async login(data: LoginInput) {
    // Phase 10.5: lockout check FIRST, before the DB read and bcrypt
    // comparison. Both are expensive (bcrypt is intentionally so), and
    // an attacker hammering a locked account shouldn't burn CPU per
    // attempt. The check is O(1) — Map lookup + a couple of timestamp
    // comparisons. Keyed by lower-cased email so case variations don't
    // bypass the counter.
    const lockState = checkLockout(data.email);
    if (lockState.locked) {
      throw new AccountLockedError(Math.ceil(lockState.retryAfterMs / 1000));
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: {
        institution: {
          include: { subscription: true },
        },
      },
    });

    if (!user) {
      // Run a dummy bcrypt comparison to match the response time of a
      // wrong-password attempt against an existing account. Without this,
      // an attacker can discover valid email addresses by measuring how much
      // faster the "email not found" path responds compared to the bcrypt
      // path. The result is discarded — we always return 401 here.
      await bcrypt.compare(data.password, DUMMY_HASH);
      recordFailure(data.email);
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      const post = recordFailure(data.email);
      if (post.locked) {
        throw new AccountLockedError(Math.ceil(post.retryAfterMs / 1000), true);
      }
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
    }

    // Successful password — clear lockout history regardless of MFA outcome.
    // The MFA step is a separate gate; failing it does NOT re-lock the
    // account at the password layer (the bad-code attempt is logged but
    // can't trigger the password lockout, otherwise an attacker who
    // correctly guessed the password could DoS the account by spamming
    // bad TOTP codes).
    clearFailures(data.email);

    const tier = resolveEffectiveTier(
      user.institution.subscription?.tier?.toLowerCase() ?? 'free',
    );

    // Phase 10.8: if the account has MFA enrolled AND verified, do not
    // mint a session token. Return a short-lived challenge token; the
    // client must POST it to /api/auth/mfa/login with a TOTP code to
    // exchange for a real session.
    if (user.mfaEnabledAt) {
      return {
        requiresMfa: true as const,
        challengeToken: generateMfaChallengeToken(user.id),
      };
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      tier,
    };

    return { token: generateToken(payload), user: payload };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        institution: {
          include: { subscription: true },
        },
      },
    });

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      tier: resolveEffectiveTier(
        user.institution.subscription?.tier?.toLowerCase() ?? 'free',
      ),
      subscription: user.institution.subscription,
      institution: {
        id: user.institution.id,
        name: user.institution.name,
        slug: user.institution.slug,
        country: user.institution.country,
        logoUrl: user.institution.logoUrl,
        domain: user.institution.domain,
        tier: user.institution.tier,
      },
    };
  }

  async updateProfile(userId: string, name: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name },
      include: {
        institution: { include: { subscription: true } },
      },
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      tier: resolveEffectiveTier(
        user.institution.subscription?.tier?.toLowerCase() ?? 'free',
      ),
    };
  }
}
