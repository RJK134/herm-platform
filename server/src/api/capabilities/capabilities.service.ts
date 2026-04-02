import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

export class CapabilitiesService {
  async listCapabilities() {
    const capabilities = await prisma.hermCapability.findMany({
      include: { family: true },
      orderBy: { sortOrder: 'asc' },
    });
    return capabilities;
  }

  async getCapabilityByCode(code: string) {
    const capability = await prisma.hermCapability.findUnique({
      where: { code },
      include: {
        family: true,
        scores: {
          include: { system: true },
          where: { version: 1 },
          orderBy: { value: 'desc' },
        },
      },
    });
    if (!capability) throw new NotFoundError(`Capability not found: ${code}`);
    return capability;
  }

  async listFamilies() {
    const families = await prisma.hermFamily.findMany({
      include: {
        _count: { select: { capabilities: true } },
        capabilities: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return families;
  }
}
