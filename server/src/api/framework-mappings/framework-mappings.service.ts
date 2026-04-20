import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';

/**
 * Service layer for cross-framework mapping queries (Enterprise tier).
 *
 * A FrameworkMapping ties two Framework rows together (source → target) and
 * owns a collection of CapabilityMapping rows, each of which represents a
 * single HERM-capability → FHE-capability translation with a strength and
 * confidence.
 */
export class FrameworkMappingsService {
  /** List all active framework mappings with framework metadata and item counts. */
  async list() {
    return prisma.frameworkMapping.findMany({
      where: { isActive: true },
      include: {
        sourceFramework: { select: { id: true, slug: true, name: true, version: true } },
        targetFramework: { select: { id: true, slug: true, name: true, version: true } },
        _count: { select: { items: true } },
      },
    });
  }

  /** Return a single mapping with all its capability items, sorted by source sortOrder. */
  async getById(id: string) {
    const mapping = await prisma.frameworkMapping.findUnique({
      where: { id },
      include: {
        sourceFramework: true,
        targetFramework: true,
        items: {
          include: {
            sourceCapability: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                domain: { select: { code: true, name: true } },
              },
            },
            targetCapability: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                domain: { select: { code: true, name: true } },
              },
            },
          },
          orderBy: { sourceCapability: { sortOrder: 'asc' } },
        },
      },
    });
    if (!mapping) throw new NotFoundError(`Framework mapping not found: ${id}`);
    return mapping;
  }

  /**
   * Look up target capabilities for a given source-capability code.
   * Returns the source capability (if found) plus all mapped targets with
   * strength, confidence, and notes. Empty `targets` array if the source
   * code has no mappings.
   */
  async lookup(mappingId: string, sourceCode: string) {
    const mapping = await prisma.frameworkMapping.findUnique({ where: { id: mappingId } });
    if (!mapping) throw new NotFoundError(`Framework mapping not found: ${mappingId}`);

    const sourceCapability = await prisma.capability.findFirst({
      where: { frameworkId: mapping.sourceFrameworkId, code: sourceCode },
    });
    if (!sourceCapability) return { sourceCapability: null, targets: [] };

    const items = await prisma.capabilityMapping.findMany({
      where: { mappingId, sourceCapabilityId: sourceCapability.id },
      include: {
        targetCapability: { include: { domain: true } },
      },
    });

    return {
      sourceCapability: {
        id: sourceCapability.id,
        code: sourceCapability.code,
        name: sourceCapability.name,
      },
      targets: items.map(i => ({
        capability: {
          id: i.targetCapability.id,
          code: i.targetCapability.code,
          name: i.targetCapability.name,
          domain: i.targetCapability.domain.name,
        },
        strength: i.strength,
        confidence: i.confidence,
        notes: i.notes,
      })),
    };
  }
}
