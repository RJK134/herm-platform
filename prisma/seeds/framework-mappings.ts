import { PrismaClient } from '@prisma/client';
import * as hermToFheMappingModule from '../../server/src/data/herm-to-fhe-mapping';

const { HERM_TO_FHE_MAPPINGS } = hermToFheMappingModule;

/**
 * Seeds the official HERM v3.1 → FHE v1.0 cross-framework mapping.
 *
 * Creates (or refreshes) a single FrameworkMapping record and a set of
 * CapabilityMapping rows drawn from HERM_TO_FHE_MAPPINGS. Existing mapping
 * items are wiped and re-inserted so the seed is idempotent and responsive
 * to edits in the source data file.
 */
export async function seedFrameworkMappings(prisma: PrismaClient): Promise<void> {
  const herm = await prisma.framework.findUnique({ where: { slug: 'herm-v3.1' } });
  const fhe = await prisma.framework.findUnique({ where: { slug: 'fhe-capability-framework' } });
  if (!herm || !fhe) {
    console.log('[Framework mappings seed] Skipping — HERM or FHE framework not found');
    return;
  }

  // Upsert the mapping record
  const mapping = await prisma.frameworkMapping.upsert({
    where: {
      sourceFrameworkId_targetFrameworkId_name: {
        sourceFrameworkId: herm.id,
        targetFrameworkId: fhe.id,
        name: 'HERM v3.1 → FHE v1.0',
      },
    },
    create: {
      sourceFrameworkId: herm.id,
      targetFrameworkId: fhe.id,
      name: 'HERM v3.1 → FHE v1.0',
      description:
        'Official mapping from UCISA HERM v3.1 business capabilities to FHE Capability Framework v1.0',
      mappingType: 'official',
      createdBy: 'system',
    },
    update: {},
  });

  // Load source (HERM) and target (FHE) capabilities for lookup
  const hermCaps = await prisma.capability.findMany({ where: { frameworkId: herm.id } });
  const fheCaps = await prisma.capability.findMany({ where: { frameworkId: fhe.id } });
  const hermByCode = new Map(hermCaps.map(c => [c.code, c]));
  const fheByCode = new Map(fheCaps.map(c => [c.code, c]));

  // Clear existing mappings, then insert fresh
  await prisma.capabilityMapping.deleteMany({ where: { mappingId: mapping.id } });

  let inserted = 0;
  let skipped = 0;
  for (const def of HERM_TO_FHE_MAPPINGS) {
    const source = hermByCode.get(def.sourceCode);
    const target = fheByCode.get(def.targetCode);
    if (!source || !target) {
      console.warn(
        `[Framework mappings seed] Skipping: ${def.sourceCode} → ${def.targetCode} (capability not found)`,
      );
      skipped++;
      continue;
    }
    await prisma.capabilityMapping.create({
      data: {
        mappingId: mapping.id,
        sourceCapabilityId: source.id,
        targetCapabilityId: target.id,
        strength: def.strength,
        confidence: def.confidence,
        notes: def.notes ?? null,
      },
    });
    inserted++;
  }

  console.log(
    `[Framework mappings seed] Seeded ${inserted} capability mappings (skipped ${skipped})`,
  );
}
