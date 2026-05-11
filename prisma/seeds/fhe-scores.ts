// prisma/seeds/fhe-scores.ts
// Seeds CapabilityScore records for the FHE Capability Framework.
//
// Strategy (see ./fhe-scoring-rules-data.ts for the rule taxonomy):
//   1. Manual override (./fhe-manual-scores-data.ts) — wins if present
//   2. Rule (./fhe-scoring-rules-data.ts) — applied if no manual override
//   3. Default 0 — applied if neither is available
//
// Expected output: 21 systems × 118 capabilities = 2,478 CapabilityScore rows.
//
// Phase 14.7b — data files were previously imported from
// server/src/data/{fhe-scoring-rules,fhe-manual-scores}, which crossed
// the workspace tsconfig boundary and triggered the same tsx-ESM
// resolution gremlins that 14.7 fixed for the framework data. The
// seeders now live entirely under prisma/seeds/.

import { PrismaClient } from '@prisma/client';
import * as fheScoringRulesModule from './fhe-scoring-rules-data';
import * as fheManualScoresModule from './fhe-manual-scores-data';

const { FHE_SCORING_RULES } = fheScoringRulesModule;
const { FHE_MANUAL_SCORES } = fheManualScoresModule;

// Mirror of the slug -> system name mapping from the main prisma/seed.ts systemsData
// array. The VendorSystem table does not persist a slug column, so we rebuild this
// lookup in-memory to join rules/manual-scores keyed by slug to the actual rows.
const SLUG_TO_NAME: Record<string, string> = {
  banner: 'Ellucian Banner',
  sits: 'Tribal SITS:Vision',
  workday_student: 'Workday Student',
  oracle_student: 'Oracle Student Cloud',
  sap_slcm: 'SAP Student Lifecycle Mgmt',
  colleague: 'Ellucian Colleague',
  peoplesoft: 'Oracle PeopleSoft CS',
  anthology_student: 'Anthology Student',
  unit4: 'Unit4 Student Management',
  ellucian_student: 'Ellucian Student (SaaS)',
  canvas: 'Canvas LMS',
  blackboard: 'Blackboard Ultra',
  moodle: 'Moodle / Workplace',
  brightspace: 'D2L Brightspace',
  aula: 'Aula (LXP)',
  anthology_reach: 'Anthology Reach',
  salesforce_edu: 'Salesforce Education Cloud',
  campusm: 'campusM (Ex Libris)',
  modern_campus: 'Modern Campus (CE/LLL)',
  workday_hcm: 'Workday HCM',
  sjms: 'SJMS v4',
};

export async function seedFheScores(prisma: PrismaClient): Promise<void> {
  console.log('[FHE scores seed] Starting...');

  // 1. Load FHE framework
  const fhe = await prisma.framework.findUnique({
    where: { slug: 'fhe-capability-framework' },
  });
  if (!fhe) {
    throw new Error(
      '[FHE scores seed] FHE framework not seeded — run seedFheFramework first',
    );
  }

  // 2. Load all 118 capabilities for this framework
  const capabilities = await prisma.capability.findMany({
    where: { frameworkId: fhe.id },
    orderBy: [{ code: 'asc' }],
  });

  if (capabilities.length === 0) {
    throw new Error(
      '[FHE scores seed] No capabilities found for FHE framework — run seedFheFramework first',
    );
  }

  // 3. Load all vendor systems with their profiles (needed by the rules engine)
  const systems = await prisma.vendorSystem.findMany({
    include: { profile: true },
  });

  if (systems.length === 0) {
    throw new Error(
      '[FHE scores seed] No vendor systems found — main seed must run before this seeder',
    );
  }

  // Build slug -> system lookup
  const systemBySlug = new Map<string, (typeof systems)[number]>();
  for (const [slug, name] of Object.entries(SLUG_TO_NAME)) {
    const sys = systems.find((s) => s.name === name);
    if (sys) {
      systemBySlug.set(slug, sys);
    } else {
      console.warn(`[FHE scores seed] No VendorSystem found for slug "${slug}" (${name})`);
    }
  }

  // 4. Build rule lookup for O(1) access by code
  const rulesByCode = new Map(FHE_SCORING_RULES.map((r) => [r.capabilityCode, r]));

  // 5. Delete existing FHE scores (clean re-seed)
  const deleted = await prisma.capabilityScore.deleteMany({
    where: { frameworkId: fhe.id },
  });
  if (deleted.count > 0) {
    console.log(`[FHE scores seed] Deleted ${deleted.count} existing FHE scores`);
  }

  // 6. Build all score records in memory
  const scoreRecords: Array<{
    frameworkId: string;
    systemId: string;
    capabilityId: string;
    value: number;
    version: number;
    source: string;
    evidence: string;
  }> = [];

  const sourceCounts: Record<string, number> = { 'manual-v1': 0, 'rules-v1': 0, default: 0 };

  for (const [slug, system] of systemBySlug.entries()) {
    const manualForSystem = FHE_MANUAL_SCORES[slug] ?? {};

    for (const cap of capabilities) {
      let value: 0 | 50 | 100 = 0;
      let source = 'default';
      let evidence = 'Not scored — no rule or manual override applied.';

      const manual = manualForSystem[cap.code];
      if (manual) {
        value = manual.value;
        source = 'manual-v1';
        evidence = manual.rationale;
      } else {
        const rule = rulesByCode.get(cap.code);
        if (rule) {
          value = rule.rule(system, system.profile);
          source = 'rules-v1';
          evidence = rule.rationale;
        }
      }

      scoreRecords.push({
        frameworkId: fhe.id,
        systemId: system.id,
        capabilityId: cap.id,
        value,
        version: 1,
        source,
        evidence,
      });
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }
  }

  // 7. Bulk insert
  await prisma.capabilityScore.createMany({ data: scoreRecords });

  console.log(`[FHE scores seed] Seeded ${scoreRecords.length} capability scores`);
  console.log('[FHE scores seed] Breakdown by source:', sourceCounts);
}
