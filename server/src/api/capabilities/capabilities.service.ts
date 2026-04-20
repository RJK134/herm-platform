import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import { getLicence } from '../../utils/licence';

export class CapabilitiesService {
  async listCapabilities() {
    const capabilities = await prisma.capability.findMany({
      include: { domain: true, framework: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Resolve licence from the first capability's framework
    const framework = capabilities.length > 0 ? capabilities[0].framework : null;
    const licence = framework ? getLicence(framework) : null;

    return { capabilities, licence };
  }

  async getCapabilityByCode(code: string) {
    const capability = await prisma.capability.findFirst({
      where: { code },
      include: {
        domain: true,
        framework: true,
        scores: {
          include: { system: true },
          where: { version: 1 },
          orderBy: { value: 'desc' },
        },
      },
    });
    if (!capability) throw new NotFoundError(`Capability not found: ${code}`);

    const licence = getLicence(capability.framework);

    return { capability, licence };
  }

  async listDomains() {
    const domains = await prisma.frameworkDomain.findMany({
      include: {
        _count: { select: { capabilities: true } },
        capabilities: { orderBy: { sortOrder: 'asc' } },
        framework: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Resolve licence from the first domain's framework
    const framework = domains.length > 0 ? domains[0].framework : null;
    const licence = framework ? getLicence(framework) : null;

    return { domains, licence };
  }
}
