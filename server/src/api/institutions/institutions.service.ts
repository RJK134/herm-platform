import prisma from '../../utils/prisma';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

export class InstitutionsService {
  async getMyInstitution(institutionId: string) {
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      include: {
        subscription: true,
        _count: { select: { users: true, projects: true, baskets: true } },
      },
    });
    if (!institution) throw new NotFoundError('Institution not found');
    return institution;
  }

  async updateInstitution(
    institutionId: string,
    data: { name?: string; logoUrl?: string; domain?: string }
  ) {
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) throw new NotFoundError('Institution not found');

    return prisma.institution.update({
      where: { id: institutionId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.domain !== undefined && { domain: data.domain }),
      },
      include: { subscription: true },
    });
  }

  async listUsers(institutionId: string) {
    return prisma.user.findMany({
      where: { institutionId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateUserRole(
    institutionId: string,
    targetUserId: string,
    role: string,
    requestingUserId: string
  ) {
    // Prevent self-demotion
    if (targetUserId === requestingUserId) {
      throw new ForbiddenError('You cannot change your own role');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target || target.institutionId !== institutionId) {
      throw new NotFoundError('User not found in your institution');
    }

    return prisma.user.update({
      where: { id: targetUserId },
      data: { role: role as never },
      select: { id: true, email: true, name: true, role: true },
    });
  }
}
