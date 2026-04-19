import bcrypt from 'bcryptjs';
import prisma from '../../utils/prisma';
import { generateToken, type JwtPayload } from '../../middleware/auth';
import { AppError, ConflictError } from '../../utils/errors';
import type { RegisterInput, LoginInput } from './auth.schema';

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
      tier: 'free',
    };

    return { token: generateToken(payload), user: payload };
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: {
        institution: {
          include: { subscription: true },
        },
      },
    });

    if (!user) {
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
    }

    const tier =
      user.institution.subscription?.tier?.toLowerCase() ?? 'free';

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
      tier: user.institution.subscription?.tier?.toLowerCase() ?? 'free',
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
      tier: user.institution.subscription?.tier?.toLowerCase() ?? 'free',
    };
  }
}
