import { PrismaClient } from '@prisma/client';
import { FHE_FRAMEWORK } from '../../server/src/data/fhe-framework';

/**
 * Seeds the FHE Capability Framework domains and capabilities.
 *
 * Expects the Framework record (slug: 'fhe-capability-framework') to already exist
 * in the database — created by the main seed. This function upserts domains and
 * capabilities under it, then updates the aggregate counts.
 */
export async function seedFheFramework(prisma: PrismaClient): Promise<void> {
  // Find the existing framework record
  const framework = await prisma.framework.findUnique({
    where: { slug: FHE_FRAMEWORK.slug },
  });

  if (!framework) {
    console.warn(`[FHE seed] Framework record not found for slug "${FHE_FRAMEWORK.slug}" — skipping.`);
    return;
  }

  let domainCount = 0;
  let capabilityCount = 0;

  for (const domain of FHE_FRAMEWORK.domains) {
    // Upsert the domain
    const domainRecord = await prisma.frameworkDomain.upsert({
      where: {
        frameworkId_code: {
          frameworkId: framework.id,
          code: domain.code,
        },
      },
      update: {
        name: domain.name,
        description: domain.description,
        colour: domain.colour,
        sortOrder: domain.sortOrder,
        category: 'Operational',
        capabilityCount: domain.capabilities.length,
      },
      create: {
        frameworkId: framework.id,
        code: domain.code,
        name: domain.name,
        description: domain.description,
        category: 'Operational',
        sortOrder: domain.sortOrder,
        colour: domain.colour,
        capabilityCount: domain.capabilities.length,
      },
    });
    domainCount++;

    // Upsert each capability in this domain
    for (const cap of domain.capabilities) {
      await prisma.capability.upsert({
        where: {
          frameworkId_code: {
            frameworkId: framework.id,
            code: cap.code,
          },
        },
        update: {
          name: cap.name,
          description: cap.description,
          domainId: domainRecord.id,
          sortOrder: cap.sortOrder,
        },
        create: {
          frameworkId: framework.id,
          code: cap.code,
          name: cap.name,
          description: cap.description,
          domainId: domainRecord.id,
          sortOrder: cap.sortOrder,
        },
      });
      capabilityCount++;
    }
  }

  // Update the framework record with final counts
  await prisma.framework.update({
    where: { id: framework.id },
    data: {
      domainCount,
      capabilityCount,
    },
  });

  console.log(`[FHE seed] Seeded ${domainCount} domains, ${capabilityCount} capabilities`);
}
