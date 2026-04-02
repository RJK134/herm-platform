import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/prisma';
import { ConflictError, AuthError, NotFoundError } from '../../utils/errors';
import type { VendorRegisterInput, VendorLoginInput, VendorProfileUpdateInput, VendorSubmissionInput } from './vendor-portal.schema';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';

export interface VendorJwtPayload {
  vendorUserId: string;
  vendorAccountId: string;
  email: string;
  name: string;
  role: string;
  companyName: string;
  tier: string;
  type: 'vendor';
}

export function generateVendorToken(payload: VendorJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export class VendorPortalService {
  async register(data: VendorRegisterInput) {
    const existing = await prisma.vendorAccount.findUnique({ where: { contactEmail: data.contactEmail } });
    if (existing) throw new ConflictError('A vendor account with this email already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);

    const account = await prisma.$transaction(async (tx) => {
      const acc = await tx.vendorAccount.create({
        data: {
          companyName: data.companyName,
          contactEmail: data.contactEmail,
          contactName: data.contactName,
          websiteUrl: data.websiteUrl,
          description: data.description,
          status: 'pending',
          tier: 'BASIC',
        },
      });
      const user = await tx.vendorUser.create({
        data: {
          email: data.contactEmail,
          name: data.contactName,
          passwordHash,
          role: 'admin',
          vendorAccountId: acc.id,
        },
      });
      return { ...acc, adminUser: user };
    });

    return account;
  }

  async login(data: VendorLoginInput) {
    const user = await prisma.vendorUser.findUnique({
      where: { email: data.email },
      include: { vendorAccount: true },
    });
    if (!user) throw new AuthError('Invalid email or password');

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw new AuthError('Invalid email or password');

    await prisma.vendorUser.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const payload: VendorJwtPayload = {
      vendorUserId: user.id,
      vendorAccountId: user.vendorAccountId,
      email: user.email,
      name: user.name,
      role: user.role,
      companyName: user.vendorAccount.companyName,
      tier: user.vendorAccount.tier,
      type: 'vendor',
    };

    return { token: generateVendorToken(payload), user: payload };
  }

  async getProfile(vendorAccountId: string) {
    const account = await prisma.vendorAccount.findUnique({
      where: { id: vendorAccountId },
      include: {
        system: { select: { id: true, name: true, vendor: true, category: true } },
        users: { select: { id: true, name: true, email: true, role: true, lastLogin: true } },
        _count: { select: { submissions: true } },
      },
    });
    if (!account) throw new NotFoundError('Vendor account not found');
    return account;
  }

  async updateProfile(vendorAccountId: string, data: VendorProfileUpdateInput) {
    return prisma.vendorAccount.update({ where: { id: vendorAccountId }, data });
  }

  async getOwnScores(vendorAccountId: string) {
    const account = await prisma.vendorAccount.findUnique({
      where: { id: vendorAccountId },
      select: { systemId: true, system: { select: { id: true, name: true, vendor: true } } },
    });
    if (!account?.systemId) return { system: null, scores: [] };

    const scores = await prisma.score.findMany({
      where: { systemId: account.systemId },
      include: {
        capability: {
          include: { family: { select: { code: true, name: true } } },
        },
      },
      orderBy: [{ capability: { family: { sortOrder: 'asc' } } }],
    });

    // Group by family
    const byFamily = new Map<string, { familyCode: string; familyName: string; capabilities: typeof scores }>();
    for (const s of scores) {
      const fc = s.capability.family.code;
      if (!byFamily.has(fc)) byFamily.set(fc, { familyCode: fc, familyName: s.capability.family.name, capabilities: [] });
      byFamily.get(fc)!.capabilities.push(s);
    }

    const totalScore = scores.reduce((a, s) => a + s.value, 0);
    const maxScore = scores.length * 100;
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      system: account.system,
      totalScore,
      maxScore,
      percentage: pct,
      byFamily: Array.from(byFamily.values()),
    };
  }

  async submitChallenge(vendorAccountId: string, data: VendorSubmissionInput) {
    return prisma.vendorSubmission.create({
      data: {
        vendorAccountId,
        type: data.type,
        data: data.data as import('@prisma/client').Prisma.InputJsonValue,
        status: 'pending',
      },
    });
  }

  async listSubmissions(vendorAccountId: string) {
    return prisma.vendorSubmission.findMany({
      where: { vendorAccountId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getAnalytics(vendorAccountId: string) {
    const analytics = await prisma.vendorAnalytic.findMany({
      where: { vendorAccountId },
      orderBy: [{ metric: 'asc' }, { period: 'desc' }],
    });

    // Current month summary
    const currentPeriod = new Date().toISOString().slice(0, 7); // "2026-04"
    const current = analytics.filter(a => a.period === currentPeriod);

    // Last 6 months trend
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    const trends: Record<string, number[]> = {};
    const metrics = ['profile_views', 'comparison_inclusions', 'basket_inclusions'];
    for (const metric of metrics) {
      trends[metric] = months.map(m => analytics.find(a => a.metric === metric && a.period === m)?.value ?? 0);
    }

    return {
      currentMonth: {
        profileViews: current.find(a => a.metric === 'profile_views')?.value ?? 0,
        comparisonInclusions: current.find(a => a.metric === 'comparison_inclusions')?.value ?? 0,
        basketInclusions: current.find(a => a.metric === 'basket_inclusions')?.value ?? 0,
        eoiResponses: current.find(a => a.metric === 'eoi_responses')?.value ?? 0,
      },
      trends,
      months,
    };
  }
}
