import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const JURISDICTIONS = [
  {
    code: 'UK',
    name: 'United Kingdom (Procurement Act 2023)',
    legislation: 'Procurement Act 2023',
    thresholds: {
      goods_services: 139688,
      works: 5372609,
      light_touch: 663540,
      currency: 'GBP',
      description: 'Above-threshold contracts requiring full competition',
    },
    minimumTimelines: {
      open_tender: 30,
      competitive_flexible: 30,
      limited_tender: 10,
      direct_award: 0,
    },
    mandatoryStages: ['PLANNING', 'MARKET_ANALYSIS', 'SPECIFICATION', 'NOTICE', 'EVALUATION', 'STANDSTILL', 'AWARD'],
    noticeRequirements: ['pipeline_notice', 'tender_notice', 'award_notice', 'contract_change_notice'],
    standstillPeriod: 8,
    rules: {
      pipeline_notice: 'Annual pipeline notice mandatory for contracting authorities for contracts above £2m',
      transparency_notices: 'Award and contract change notices must be published on the central Find a Tender platform within 30 days',
      covered_procurement: 'All public contracts above threshold value; covers central government, NHS, local authorities, and other public bodies',
      excluded_contracts: 'Defence and security contracts have a separate regime; utilities have their own regulations',
      dynamic_markets: 'Dynamic Markets replace Dynamic Purchasing Systems; any supplier meeting the criteria may join at any time',
      competitive_flexible: 'New flexible procedure replacing competitive dialogue and competitive procedure with negotiation',
      below_threshold: 'Contracts below threshold still require transparency notices published on Find a Tender',
      standstill_note: '8 calendar days standstill before contract can be executed (reduced from 10 under PCR 2015)',
    },
    isActive: true,
  },
  {
    code: 'EU',
    name: 'European Union (Directive 2014/24/EU)',
    legislation: 'Directive 2014/24/EU on public procurement',
    thresholds: {
      central_government_goods_services: 143000,
      other_authorities_goods_services: 221000,
      works: 5538000,
      social_services: 750000,
      currency: 'EUR',
      description: 'OJEU thresholds — contracts above these must be advertised EU-wide',
    },
    minimumTimelines: {
      open_expression_of_interest: 30,
      open_tender: 35,
      restricted_expression: 30,
      restricted_tender: 30,
      competitive_dialogue: 30,
      innovation_partnership: 30,
    },
    mandatoryStages: ['PLANNING', 'SPECIFICATION', 'NOTICE', 'EVALUATION', 'STANDSTILL', 'AWARD'],
    noticeRequirements: ['prior_information_notice', 'contract_notice', 'award_notice'],
    standstillPeriod: 10,
    rules: {
      espd: 'European Single Procurement Document (ESPD) mandatory for qualification stage',
      ted: 'All above-threshold notices must be published on TED (Tenders Electronic Daily) via eSender',
      e_procurement: 'Electronic submission of tenders mandatory since October 2018',
      procurement_procedures: 'Open, restricted, competitive dialogue, competitive procedure with negotiation, innovation partnership, negotiated without prior publication',
      abnormally_low_tenders: 'Must investigate and may reject abnormally low tenders',
      award_criteria: 'Must use MEAT (Most Economically Advantageous Tender) criteria',
    },
    isActive: true,
  },
  {
    code: 'US_FEDERAL',
    name: 'United States Federal (FAR)',
    legislation: 'Federal Acquisition Regulation (FAR)',
    thresholds: {
      micro_purchase: 10000,
      simplified_acquisition: 250000,
      full_and_open: 250001,
      small_business_set_aside: 250000,
      currency: 'USD',
      description: 'FAR thresholds — above simplified acquisition requires full competition',
    },
    minimumTimelines: {
      full_and_open: 30,
      small_business_set_aside: 15,
      sole_source_justification: 0,
      request_for_information: 10,
    },
    mandatoryStages: ['MARKET_RESEARCH', 'SPECIFICATION', 'SOLICITATION', 'EVALUATION', 'AWARD'],
    noticeRequirements: ['sources_sought', 'solicitation_notice', 'award_notice'],
    standstillPeriod: 0,
    rules: {
      sam_registration: 'All vendors must be registered in SAM.gov (System for Award Management) to receive federal contracts',
      far_part_15: 'Negotiated procurements above simplified acquisition follow FAR Part 15',
      small_business: 'Procurements between $3,500 and $150,000 are reserved for small businesses by default',
      set_asides: 'Various set-aside programs: 8(a), HUBZone, SDVOSB, WOSB, AbilityOne',
      justification_approval: 'Other than full and open competition requires J&A (Justification and Approval)',
      debriefs: 'Unsuccessful offerors entitled to debrief within 5 days of award',
    },
    isActive: true,
  },
  {
    code: 'US_STATE',
    name: 'United States State & Local',
    legislation: 'Varies by state — model based on ABA Model Procurement Code',
    thresholds: {
      informal_bids: 50000,
      formal_bids: 50001,
      sole_source: 25000,
      currency: 'USD',
      description: 'Generic thresholds — varies significantly by state jurisdiction',
    },
    minimumTimelines: {
      invitation_to_bid: 21,
      request_for_proposals: 21,
      request_for_qualifications: 14,
    },
    mandatoryStages: ['PLANNING', 'SPECIFICATION', 'NOTICE', 'EVALUATION', 'AWARD'],
    noticeRequirements: ['public_notice', 'award_notice'],
    standstillPeriod: 0,
    rules: {
      state_register: 'Procurement notices typically published in state procurement portal/register',
      protest_rights: 'Bidder protest rights vary by state — typically 5-10 days post-award',
      local_preferences: 'Many states allow local or in-state preferences for certain contracts',
      cooperative_purchasing: 'Use of cooperative purchasing contracts (e.g., NASPO, NJPA) widely permitted',
      note: 'Requirements vary significantly by state — always verify applicable state statutes',
    },
    isActive: true,
  },
  {
    code: 'AU',
    name: 'Australia (Commonwealth Procurement Rules)',
    legislation: 'Commonwealth Procurement Rules (CPRs) 2023',
    thresholds: {
      goods_services: 80000,
      construction: 7500000,
      currency: 'AUD',
      description: 'CPR thresholds — open approach to market required above these values',
    },
    minimumTimelines: {
      open_tender: 25,
      select_tender: 0,
      limited_tender: 0,
    },
    mandatoryStages: ['PLANNING', 'MARKET_ANALYSIS', 'SPECIFICATION', 'APPROACH', 'EVALUATION', 'AWARD'],
    noticeRequirements: ['approach_to_market', 'award_notice'],
    standstillPeriod: 0,
    rules: {
      austender: 'All Commonwealth approaches to market and contracts above $10,000 must be published on AusTender',
      value_for_money: 'Value for money is the core principle — lowest price not necessarily mandatory',
      indigenous_procurement: 'Indigenous Procurement Policy (IPP) targets apply for contracts above $7.5m and in remote areas',
      aps_procurement: 'Australian Public Service entities must comply with CPRs; GBEs have separate rules',
      sustainability: 'Consider environmental sustainability and social value in procurement decisions',
      ict_procurement: 'ICT contracts must consider SME participation and whole-of-government arrangements',
    },
    isActive: true,
  },
];

async function main() {
  console.log('Seeding procurement jurisdictions...');
  for (const j of JURISDICTIONS) {
    await prisma.procurementJurisdiction.upsert({
      where: { code: j.code },
      update: {
        name: j.name,
        legislation: j.legislation,
        thresholds: j.thresholds,
        minimumTimelines: j.minimumTimelines,
        mandatoryStages: j.mandatoryStages,
        noticeRequirements: j.noticeRequirements,
        standstillPeriod: j.standstillPeriod ?? null,
        rules: j.rules,
        isActive: j.isActive,
      },
      create: j,
    });
    console.log(`  ✓ ${j.code}: ${j.name}`);
  }
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
