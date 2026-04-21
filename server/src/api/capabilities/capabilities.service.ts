import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import { getLicence } from '../../utils/licence';

export class CapabilitiesService {
  /**
   * All reads scope by frameworkId so HERM and FHE (and future frameworks)
   * never bleed into each other. Callers pass the active framework from
   * the framework-context middleware.
   */
  async listCapabilities(frameworkId?: string) {
    const capabilities = await prisma.capability.findMany({
      where: frameworkId ? { frameworkId } : undefined,
      include: { domain: true, framework: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Resolve licence from the first capability's framework
    const framework = capabilities.length > 0 ? capabilities[0].framework : null;
    const licence = framework ? getLicence(framework) : null;

    return { capabilities, licence };
  }

  async getCapabilityByCode(code: string, frameworkId?: string) {
    // Capability.code is only unique within a framework; scope explicitly.
    const capability = await prisma.capability.findFirst({
      where: {
        code,
        ...(frameworkId ? { frameworkId } : {}),
      },
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

  async listDomains(frameworkId?: string) {
    const domains = await prisma.frameworkDomain.findMany({
      where: frameworkId ? { frameworkId } : undefined,
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
