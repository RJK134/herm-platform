import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import type { UpdateVendorProfileInput } from './vendors.schema';

export class VendorsService {
  async getProfile(systemId: string) {
    const system = await prisma.vendorSystem.findUnique({ where: { id: systemId } });
    if (!system) throw new NotFoundError(`System not found: ${systemId}`);

    const profile = await prisma.vendorProfile.findUnique({
      where: { systemId },
      include: { system: true },
    });

    return profile;
  }

  async updateProfile(systemId: string, data: UpdateVendorProfileInput) {
    const system = await prisma.vendorSystem.findUnique({ where: { id: systemId } });
    if (!system) throw new NotFoundError(`System not found: ${systemId}`);

    return prisma.vendorProfile.upsert({
      where: { systemId },
      create: { systemId, ...data },
      update: { ...data, lastUpdated: new Date() },
    });
  }

  async getVersions(systemId: string) {
    const system = await prisma.vendorSystem.findUnique({ where: { id: systemId } });
    if (!system) throw new NotFoundError(`System not found: ${systemId}`);

    return prisma.vendorVersion.findMany({
      where: { systemId },
      include: {
        scores: {
          include: {
            capability: { include: { domain: true } },
          },
        },
      },
      orderBy: { releaseDate: 'desc' },
    });
  }
}
