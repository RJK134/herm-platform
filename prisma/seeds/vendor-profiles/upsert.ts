import type { PrismaClient } from '@prisma/client';
import { profiles } from './profiles-data';
import { researchItems } from './research-items-data';
import { methodologyRecords } from './scoring-methodology-data';

export async function upsertVendorProfiles(prisma: PrismaClient): Promise<number> {
  let seeded = 0;
  for (const profileData of profiles) {
    const system = await prisma.vendorSystem.findFirst({
      where: { name: { contains: profileData.systemNameContains } },
    });

    if (!system) {
      console.warn(`System not found for: ${profileData.systemNameContains} — skipping`);
      continue;
    }

    const payload = {
      foundedYear: profileData.foundedYear ?? null,
      headquarters: profileData.headquarters ?? null,
      employees: profileData.employees ?? null,
      marketShare: profileData.marketShare ?? null,
      gartnerPosition: profileData.gartnerPosition ?? null,
      deploymentModel: profileData.deploymentModel,
      techStack: profileData.techStack ?? null,
      apiStandards: profileData.apiStandards,
      integrationProtocols: profileData.integrationProtocols,
      certifications: profileData.certifications,
      pricingModel: profileData.pricingModel ?? null,
      typicalCostRange: profileData.typicalCostRange ?? null,
      implementationTime: profileData.implementationTime ?? null,
      keyStrengths: profileData.keyStrengths,
      knownLimitations: profileData.knownLimitations,
      recentNews: profileData.recentNews ?? null,
    };

    await prisma.vendorProfile.upsert({
      where: { systemId: system.id },
      create: { systemId: system.id, ...payload },
      update: { ...payload, lastUpdated: new Date() },
    });
    seeded++;
  }
  return seeded;
}

export async function upsertResearchItems(prisma: PrismaClient): Promise<number> {
  for (const item of researchItems) {
    await prisma.researchItem.create({
      data: {
        title: item.title,
        publisher: item.publisher,
        year: item.year,
        category: item.category,
        tags: item.tags,
        summary: item.summary ?? null,
        url: item.url ?? null,
        relevantSystems: item.relevantSystems,
      },
    });
  }
  return researchItems.length;
}

export async function upsertScoringMethodology(prisma: PrismaClient): Promise<number> {
  for (const record of methodologyRecords) {
    await prisma.scoringMethodology.upsert({
      where: { category: record.category },
      create: {
        category: record.category,
        content: record.content as Parameters<typeof prisma.scoringMethodology.upsert>[0]['create']['content'],
      },
      update: {
        content: record.content as Parameters<typeof prisma.scoringMethodology.upsert>[0]['update']['content'],
      },
    });
  }
  return methodologyRecords.length;
}
