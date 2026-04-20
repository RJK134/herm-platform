import type { PrismaClient } from '@prisma/client';
import {
  upsertVendorProfiles,
  upsertResearchItems,
  upsertScoringMethodology,
} from './upsert';

export async function seedVendorProfiles(prisma: PrismaClient): Promise<void> {
  console.log('Seeding vendor profiles...');
  const vendorCount = await upsertVendorProfiles(prisma);
  console.log(`Seeded ${vendorCount} vendor profiles`);

  console.log('Seeding research items...');
  const researchCount = await upsertResearchItems(prisma);
  console.log(`Seeded ${researchCount} research items`);

  console.log('Seeding scoring methodology...');
  const methodologyCount = await upsertScoringMethodology(prisma);
  console.log(`Seeded ${methodologyCount} scoring methodology records`);
}

export { upsertVendorProfiles, upsertResearchItems, upsertScoringMethodology };
export type { VendorProfileData, ResearchItemData, ScoringMethodologyRecord } from './types';
