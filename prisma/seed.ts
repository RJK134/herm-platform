import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { capabilitiesData } from './seeds/capabilities-data';
import { getPrismaClient } from './_neon-http-prisma';

const prisma: PrismaClient = await getPrismaClient();
const DEMO_PASSWORD = process.env['DEMO_PASSWORD'] ?? 'demo12345';

async function main() {
  console.log('Seeding HERM platform...');

  // Clean slate — delete in dependency order
  await prisma.versionScore.deleteMany();
  await prisma.vendorVersion.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.capabilityScore.deleteMany();
  await prisma.basketItem.deleteMany();
  await prisma.capabilityBasket.deleteMany();
  await prisma.capability.deleteMany();
  await prisma.frameworkDomain.deleteMany();
  await prisma.framework.deleteMany();
  await prisma.shortlistEntry.deleteMany();
  await prisma.workflowStage.deleteMany();
  await prisma.procurementWorkflow.deleteMany();
  await prisma.procurementProject.deleteMany();
  await prisma.tcoEstimate.deleteMany();
  await prisma.integrationAssessment.deleteMany();
  await prisma.vendorSystem.deleteMany();

  // ── FRAMEWORKS ────────────────────────────────────────────────────────────
  const hermFramework = await prisma.framework.create({
    data: {
      slug: 'herm-v3.1',
      name: 'UCISA HERM v3.1',
      version: '3.1',
      publisher: 'CAUDIT',
      description: 'Higher Education Reference Model — 165 business capabilities across 11 domains, published under CC BY-NC-SA 4.0.',
      licenceType: 'CC-BY-NC-SA-4.0',
      licenceNotice: 'This work is based on the UCISA Higher Education Reference Model (HERM) v3.1, published by the Council of Australasian University Directors of Information Technology (CAUDIT) and licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.',
      licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      isPublic: true,
      isDefault: false,
      isActive: true,
      domainCount: 11,
      capabilityCount: 165,
    },
  });

  const fheFramework = await prisma.framework.create({
    data: {
      slug: 'fhe-capability-framework',
      name: 'FHE Capability Framework',
      version: '1.0',
      publisher: 'Future Horizons Education',
      description: 'Proprietary capability management framework for institutional technology assessment, procurement, and maturity evaluation.',
      licenceType: 'PROPRIETARY',
      isPublic: false,
      isDefault: true,
      isActive: true,
      domainCount: 0,
      capabilityCount: 0,
    },
  });
  console.log('Created 2 frameworks (HERM + FHE)');

  // ── FAMILIES ──────────────────────────────────────────────────────────────
  const familiesData = [
    { code: 'LT',  name: 'Learning & Teaching',        category: 'Core',     sortOrder: 1  },
    { code: 'RE',  name: 'Research',                   category: 'Core',     sortOrder: 2  },
    { code: 'SG',  name: 'Strategy & Governance',      category: 'Enabling', sortOrder: 3  },
    { code: 'FM',  name: 'Financial Management',       category: 'Enabling', sortOrder: 4  },
    { code: 'HR',  name: 'Human Resource Management',  category: 'Enabling', sortOrder: 5  },
    { code: 'ICT', name: 'ICT Management',             category: 'Enabling', sortOrder: 6  },
    { code: 'FE',  name: 'Facilities & Estate Management', category: 'Enabling', sortOrder: 7 },
    { code: 'EC',  name: 'Engagement & Communication', category: 'Enabling', sortOrder: 8  },
    { code: 'IM',  name: 'Information Management',     category: 'Enabling', sortOrder: 9  },
    { code: 'LC',  name: 'Legal & Compliance',         category: 'Enabling', sortOrder: 10 },
    { code: 'SS',  name: 'Supporting Services',        category: 'Enabling', sortOrder: 11 },
  ];

  const domainMap: Record<string, string> = {};
  for (const f of familiesData) {
    const dom = await prisma.frameworkDomain.create({
      data: { ...f, frameworkId: hermFramework.id },
    });
    domainMap[f.code] = dom.id;
  }
  console.log(`Created ${familiesData.length} domains`);

  // ── CAPABILITIES ──────────────────────────────────────────────────────────

  const capabilityMap: Record<string, string> = {};
  for (const c of capabilitiesData) {
    const cap = await prisma.capability.create({
      data: {
        code: c.code,
        name: c.name,
        frameworkId: hermFramework.id,
        domainId: domainMap[c.domainCode],
        sortOrder: c.sortOrder,
      },
    });
    capabilityMap[c.code] = cap.id;
  }
  console.log(`Created ${capabilitiesData.length} capabilities`);

  // ── SYSTEMS ───────────────────────────────────────────────────────────────
  const systemsData = [
    { slug: 'banner',            name: 'Ellucian Banner',            vendor: 'Ellucian',                   category: 'SIS',  cloudNative: false, isOwnSystem: false, regions: ['US', 'Ireland', 'International'],         description: "The world's most widely deployed higher education ERP, managing the complete administrative lifecycle across student, financial aid, accounts receivable, HR, and administration modules." },
    { slug: 'sits',              name: 'Tribal SITS:Vision',         vendor: 'Tribal Group',               category: 'SIS',  cloudNative: false, isOwnSystem: false, regions: ['UK', 'Australia', 'APAC'],                description: 'The dominant student records system in UK higher education with over 60% market share, managing all aspects of the student journey from enquiry to alumni.' },
    { slug: 'workday_student',   name: 'Workday Student',            vendor: 'Workday',                    category: 'SIS',  cloudNative: true,  isOwnSystem: false, regions: ['US', 'UK', 'Australia', 'Europe'],        description: 'Cloud-native SIS with unified HR-Finance-Student platform, the fastest-growing challenger in the enterprise HE market with 650+ institutions.' },
    { slug: 'oracle_student',    name: 'Oracle Student Cloud',       vendor: 'Oracle',                     category: 'SIS',  cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'Modern cloud-based student platform delivering lifelong learning on a single platform with touchless processes and smart automation.' },
    { slug: 'sap_slcm',          name: 'SAP Student Lifecycle Mgmt', vendor: 'SAP',                        category: 'SIS',  cloudNative: false, isOwnSystem: false, regions: ['Germany', 'Europe'],                      description: 'Manages the student lifecycle from admission to graduation within the broader SAP S/4HANA Cloud ecosystem, strong in continental European institutions.' },
    { slug: 'colleague',         name: 'Ellucian Colleague',         vendor: 'Ellucian',                   category: 'SIS',  cloudNative: false, isOwnSystem: false, regions: ['US'],                                     description: 'A comprehensive ERP designed for smaller to mid-sized institutions, offering student records, financial aid, and administrative functions.' },
    { slug: 'peoplesoft',        name: 'Oracle PeopleSoft CS',       vendor: 'Oracle',                     category: 'SIS',  cloudNative: false, isOwnSystem: false, regions: ['US'],                                     description: 'Long-established Campus Solutions suite with significant installations at large public US universities, covering admissions through alumni.' },
    { slug: 'anthology_student', name: 'Anthology Student',          vendor: 'Anthology',                  category: 'SIS',  cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'Cloud SIS and ERP streamlining operations with intelligent capacity planning, automated contracting, and dynamic student management.' },
    { slug: 'unit4',             name: 'Unit4 Student Management',   vendor: 'Unit4',                      category: 'SIS',  cloudNative: true,  isOwnSystem: false, regions: ['Europe', 'International'],                description: 'Connects recruitment, admissions, academic operations, student success, and advancement on a unified cloud platform, strong in European HE.' },
    { slug: 'ellucian_student',  name: 'Ellucian Student (SaaS)',    vendor: 'Ellucian',                   category: 'SIS',  cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'SaaS-native platform unifying SIS, platform services, HCM, and ERP — the cloud-native successor to Banner and Colleague.' },
    { slug: 'canvas',            name: 'Canvas LMS',                 vendor: 'Instructure',                category: 'LMS', cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'The most widely adopted LMS in US higher education, used by all ten top-rated US universities.' },
    { slug: 'blackboard',        name: 'Blackboard Ultra',           vendor: 'Anthology',                  category: 'LMS', cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'Ground-up redesign with modern mobile-first cloud interface, Progress Tracking, Flexible Grading, and Discussion Analytics.' },
    { slug: 'moodle',            name: 'Moodle / Workplace',         vendor: 'Moodle Pty Ltd',             category: 'LMS', cloudNative: false, isOwnSystem: false, regions: ['Global', 'Europe'],                       description: 'The dominant open-source LMS globally, especially in European university consortia.' },
    { slug: 'brightspace',       name: 'D2L Brightspace',            vendor: 'D2L',                        category: 'LMS', cloudNative: true,  isOwnSystem: false, regions: ['US', 'Canada', 'International'],          description: 'Standards-driven LMS leading with 1EdTech Global certifications, first commercial LMS certified for LTI.' },
    { slug: 'aula',              name: 'Aula (LXP)',                 vendor: 'Aula Education',             category: 'LMS', cloudNative: true,  isOwnSystem: false, regions: ['UK'],                                     description: 'Learning Experience Platform emphasising community-first learning for UK universities.' },
    { slug: 'anthology_reach',   name: 'Anthology Reach',            vendor: 'Anthology',                  category: 'CRM', cloudNative: true,  isOwnSystem: false, regions: ['US', 'International'],                    description: 'Full-lifecycle CRM on Microsoft Dynamics 365 covering admissions, student success, retention, alumni, and advancement.' },
    { slug: 'salesforce_edu',    name: 'Salesforce Education Cloud', vendor: 'Salesforce',                 category: 'CRM', cloudNative: true,  isOwnSystem: false, regions: ['US', 'UK', 'International'],              description: 'Comprehensive CRM platform on Education Data Architecture covering recruitment, admissions, student success, alumni, and advancement.' },
    { slug: 'campusm',           name: 'campusM (Ex Libris)',        vendor: 'Ex Libris / Clarivate',      category: 'CRM', cloudNative: true,  isOwnSystem: false, regions: ['UK', 'International'],                    description: 'Student engagement mobile platform at 50+ UK universities.' },
    { slug: 'modern_campus',     name: 'Modern Campus (CE/LLL)',     vendor: 'Modern Campus',              category: 'CRM', cloudNative: true,  isOwnSystem: false, regions: ['US', 'Canada'],                           description: 'The leading SIS for non-traditional and continuing education with AI-driven pathways and eCommerce enrollment.' },
    { slug: 'workday_hcm',       name: 'Workday HCM',               vendor: 'Workday',                    category: 'HCM', cloudNative: true,  isOwnSystem: false, regions: ['US', 'UK', 'Australia'],                  description: 'Widely deployed alongside Workday Student and Financials as part of a unified university technology suite.' },
    { slug: 'sjms',              name: 'SJMS v4',                    vendor: 'Future Horizons Education',  category: 'SJMS', cloudNative: true, isOwnSystem: true,  regions: ['UK'],                                     description: 'Student Journey Management System — an in-house academic management platform. HERM audit: 84/130 SIS-relevant capabilities at 64.6% coverage.' },
  ];

  const systemMap: Record<string, string> = {};
  for (const s of systemsData) {
    const sys = await prisma.vendorSystem.create({
      data: {
        name: s.name,
        vendor: s.vendor,
        category: s.category,
        description: s.description,
        regions: s.regions,
        cloudNative: s.cloudNative,
        isOwnSystem: s.isOwnSystem,
      },
    });
    systemMap[s.slug] = sys.id;
  }
  console.log(`Created ${systemsData.length} systems`);

  // ── SCORES ────────────────────────────────────────────────────────────────
  // Raw scores: systemSlug -> capabilityCode -> value
  const rawScores: Record<string, Record<string, number>> = {
    banner: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 50, BC012: 50, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 100, BC161: 50, BC037: 50, BC017: 50, BC060: 50, BC071: 50, BC031: 50, BC034: 50, BC156: 50, BC233: 50, BC019: 50, BC137: 50, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 100, BC101: 100, BC103: 100, BC106: 100, BC170: 50, BC171: 50, BC177: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 50, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC110: 50, BC038: 0, BC164: 50 },
    sits: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 100, BC006: 100, BC029: 100, BC030: 100, BC032: 50, BC033: 100, BC018: 50, BC102: 100, BC104: 100, BC013: 100, BC012: 100, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 50, BC161: 50, BC037: 50, BC017: 100, BC060: 100, BC071: 100, BC031: 100, BC034: 0, BC156: 0, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 50, BC086: 100, BC193: 100, BC090: 100, BC100: 0, BC101: 0, BC103: 0, BC106: 0, BC004: 100, BC007: 100, BC035: 100, BC015: 100, BC022: 100, BC023: 50, BC039: 100, BC040: 100, BC084: 50, BC123: 50, BC124: 50, BC127: 50, BC162: 50, BC163: 50, BC150: 50, BC036: 100, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 100, BC038: 50, BC164: 50, BC110: 0, BC021: 50, BC027: 50 },
    workday_student: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 100, BC012: 100, BC153: 100, BC020: 100, BC128: 100, BC172: 100, BC160: 100, BC161: 100, BC037: 100, BC017: 100, BC060: 50, BC071: 50, BC031: 50, BC034: 0, BC156: 0, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 100, BC101: 100, BC103: 100, BC106: 100, BC170: 100, BC171: 100, BC174: 100, BC175: 100, BC177: 100, BC178: 100, BC173: 100, BC176: 50, BC182: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 100, BC163: 100, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 50, BC164: 100, BC110: 100, BC109: 100, BC107: 100, BC108: 50, BC105: 100, BC194: 100, BC036: 50, BC021: 50, BC027: 50 },
    oracle_student: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 50, BC012: 50, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 100, BC161: 100, BC037: 100, BC017: 100, BC060: 50, BC071: 50, BC031: 50, BC034: 0, BC156: 0, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 100, BC086: 0, BC193: 0, BC090: 100, BC100: 50, BC101: 50, BC103: 50, BC106: 0, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 100, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 50, BC164: 50, BC110: 50, BC036: 50, BC021: 50, BC027: 50 },
    sap_slcm: { BC008: 100, BC009: 100, BC010: 50, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 50, BC102: 100, BC104: 100, BC013: 100, BC012: 100, BC153: 100, BC020: 50, BC128: 100, BC172: 100, BC160: 100, BC161: 50, BC037: 50, BC017: 50, BC060: 50, BC071: 50, BC031: 50, BC034: 0, BC156: 0, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 100, BC086: 0, BC193: 0, BC090: 100, BC100: 100, BC101: 100, BC103: 100, BC106: 100, BC170: 100, BC171: 100, BC174: 100, BC175: 100, BC177: 100, BC178: 100, BC173: 100, BC176: 50, BC182: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 100, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 0, BC164: 50, BC110: 100, BC109: 100, BC107: 100, BC105: 100, BC194: 100, BC036: 50, BC021: 50 },
    colleague: { BC008: 100, BC009: 100, BC010: 50, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 50, BC012: 50, BC153: 100, BC020: 50, BC128: 100, BC172: 50, BC160: 50, BC161: 0, BC037: 0, BC017: 50, BC060: 50, BC071: 50, BC031: 50, BC034: 50, BC156: 50, BC233: 0, BC019: 50, BC137: 50, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 100, BC101: 100, BC103: 100, BC106: 100, BC170: 50, BC171: 50, BC177: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 50, BC127: 50, BC162: 50, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 0, BC164: 50, BC110: 50, BC036: 50 },
    peoplesoft: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 100, BC012: 100, BC153: 100, BC020: 50, BC128: 50, BC172: 50, BC160: 50, BC161: 0, BC037: 0, BC017: 0, BC060: 50, BC071: 50, BC031: 50, BC034: 100, BC156: 100, BC233: 100, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 50, BC086: 0, BC193: 0, BC090: 100, BC100: 50, BC101: 50, BC103: 50, BC106: 50, BC170: 50, BC171: 50, BC177: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 100, BC040: 50, BC084: 50, BC123: 100, BC124: 50, BC127: 50, BC162: 50, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 0, BC164: 50, BC110: 50, BC036: 50 },
    anthology_student: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 50, BC012: 50, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 100, BC161: 100, BC037: 100, BC017: 100, BC060: 50, BC071: 50, BC031: 50, BC034: 50, BC156: 50, BC233: 0, BC019: 50, BC137: 50, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 50, BC101: 50, BC103: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 100, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 50, BC164: 50, BC110: 50, BC036: 100, BC021: 50 },
    unit4: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 100, BC012: 100, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 100, BC161: 100, BC037: 100, BC017: 100, BC060: 50, BC071: 50, BC031: 50, BC034: 100, BC156: 100, BC233: 50, BC019: 100, BC137: 100, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 50, BC101: 50, BC103: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 100, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 50, BC127: 50, BC162: 50, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 50, BC164: 50, BC110: 50, BC036: 50, BC021: 50, BC027: 50 },
    ellucian_student: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC005: 50, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 100, BC102: 100, BC104: 100, BC013: 50, BC012: 50, BC153: 100, BC020: 100, BC128: 100, BC172: 50, BC160: 100, BC161: 100, BC037: 100, BC017: 100, BC060: 50, BC071: 50, BC031: 50, BC034: 50, BC156: 50, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 100, BC122: 100, BC086: 50, BC193: 50, BC090: 100, BC100: 50, BC101: 50, BC103: 50, BC004: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 50, BC084: 50, BC123: 100, BC124: 100, BC127: 50, BC162: 100, BC163: 50, BC150: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0, BC041: 50, BC038: 50, BC164: 50, BC110: 50, BC036: 50, BC021: 50 },
    canvas: { BC002: 100, BC003: 100, BC024: 100, BC025: 100, BC029: 100, BC030: 100, BC016: 100, BC129: 100, BC014: 100, BC026: 100, BC037: 100, BC020: 100, BC015: 50, BC128: 100, BC023: 100, BC035: 100, BC027: 50, BC090: 100, BC121: 50, BC161: 50, BC032: 50, BC036: 50, BC160: 50, BC162: 50, BC150: 50, BC153: 100, BC038: 50, BC008: 0, BC009: 0, BC011: 0, BC018: 0, BC102: 0, BC104: 0, BC013: 0, BC033: 0, BC028: 0, BC034: 0, BC001: 50 },
    blackboard: { BC002: 100, BC003: 100, BC024: 100, BC025: 100, BC029: 100, BC030: 100, BC016: 100, BC129: 100, BC014: 100, BC026: 100, BC037: 100, BC020: 100, BC015: 50, BC128: 100, BC023: 100, BC035: 100, BC027: 50, BC090: 100, BC121: 50, BC161: 50, BC032: 50, BC036: 50, BC160: 50, BC162: 50, BC150: 50, BC153: 100, BC038: 0, BC008: 0, BC009: 0, BC011: 0, BC018: 0, BC102: 0, BC104: 0, BC013: 0, BC033: 0, BC028: 0, BC034: 0, BC001: 50 },
    moodle: { BC002: 100, BC003: 100, BC024: 100, BC025: 100, BC029: 100, BC030: 100, BC016: 100, BC129: 100, BC014: 100, BC026: 100, BC037: 50, BC020: 50, BC015: 50, BC128: 100, BC023: 100, BC035: 100, BC027: 50, BC090: 100, BC121: 100, BC161: 50, BC032: 50, BC036: 50, BC160: 50, BC162: 50, BC150: 50, BC153: 50, BC038: 100, BC182: 100, BC008: 0, BC009: 0, BC011: 0, BC018: 0, BC102: 0, BC104: 0, BC013: 0, BC033: 0, BC028: 0, BC034: 0, BC001: 50 },
    brightspace: { BC002: 100, BC003: 100, BC024: 100, BC025: 100, BC029: 100, BC030: 100, BC016: 100, BC129: 100, BC014: 100, BC026: 100, BC037: 100, BC020: 100, BC015: 50, BC128: 100, BC023: 100, BC035: 100, BC027: 50, BC090: 100, BC121: 50, BC161: 100, BC032: 50, BC036: 50, BC160: 50, BC162: 50, BC150: 50, BC153: 100, BC038: 50, BC008: 0, BC009: 0, BC011: 0, BC018: 0, BC102: 0, BC104: 0, BC013: 0, BC033: 0, BC028: 0, BC034: 0, BC001: 50 },
    aula: { BC002: 100, BC003: 100, BC024: 100, BC025: 50, BC029: 50, BC030: 50, BC016: 100, BC129: 50, BC014: 100, BC026: 100, BC037: 100, BC020: 100, BC015: 50, BC128: 100, BC023: 50, BC035: 50, BC027: 0, BC090: 100, BC121: 0, BC161: 50, BC032: 0, BC036: 100, BC160: 50, BC162: 50, BC150: 100, BC153: 100, BC038: 0, BC008: 0, BC009: 0, BC011: 0, BC018: 0, BC102: 0, BC104: 0, BC013: 0, BC033: 0, BC028: 0, BC034: 0, BC001: 50 },
    anthology_reach: { BC008: 100, BC009: 100, BC016: 100, BC017: 100, BC020: 100, BC034: 100, BC156: 100, BC233: 100, BC161: 100, BC037: 50, BC150: 100, BC157: 100, BC128: 50, BC129: 100, BC015: 0, BC011: 0, BC102: 0, BC021: 0, BC027: 0, BC121: 100, BC038: 0, BC028: 50, BC160: 100, BC152: 100, BC153: 100, BC151: 100, BC010: 50, BC166: 100, BC154: 50, BC162: 50, BC163: 50, BC226: 50 },
    salesforce_edu: { BC008: 100, BC009: 100, BC016: 100, BC017: 100, BC020: 100, BC034: 100, BC156: 100, BC233: 100, BC161: 100, BC037: 50, BC150: 100, BC157: 100, BC128: 50, BC129: 100, BC015: 0, BC011: 50, BC102: 50, BC021: 50, BC027: 0, BC121: 100, BC038: 50, BC028: 100, BC160: 100, BC152: 100, BC153: 100, BC151: 100, BC010: 50, BC166: 100, BC154: 50, BC162: 100, BC163: 100, BC226: 50, BC033: 0, BC164: 100 },
    campusm: { BC008: 0, BC009: 0, BC016: 100, BC017: 50, BC020: 100, BC034: 100, BC156: 0, BC233: 0, BC161: 100, BC037: 50, BC150: 0, BC157: 0, BC128: 100, BC129: 100, BC015: 100, BC011: 0, BC102: 0, BC021: 0, BC027: 0, BC121: 50, BC038: 0, BC028: 0, BC160: 50, BC152: 50, BC153: 100, BC151: 50, BC010: 50, BC134: 100, BC215: 100, BC026: 50 },
    modern_campus: { BC008: 100, BC009: 100, BC016: 50, BC017: 0, BC020: 50, BC034: 0, BC156: 0, BC233: 0, BC161: 50, BC037: 0, BC150: 100, BC157: 50, BC128: 0, BC129: 100, BC015: 0, BC011: 100, BC102: 100, BC021: 100, BC027: 100, BC121: 50, BC038: 100, BC028: 50, BC160: 50, BC152: 50, BC153: 50, BC151: 50, BC010: 50, BC001: 100, BC002: 100, BC003: 50, BC104: 100, BC100: 50 },
    workday_hcm: { BC170: 100, BC171: 100, BC172: 100, BC173: 100, BC174: 100, BC175: 100, BC176: 100, BC182: 100, BC177: 100, BC178: 100, BC100: 100, BC101: 100, BC102: 100, BC103: 100, BC104: 50, BC105: 100, BC106: 100, BC107: 100, BC108: 100, BC109: 100, BC110: 100, BC194: 100, BC008: 50, BC009: 50, BC010: 50, BC011: 50, BC016: 50, BC028: 50, BC001: 50, BC002: 50, BC003: 50, BC006: 50, BC029: 50, BC033: 50, BC018: 50, BC122: 100, BC123: 100, BC124: 100, BC129: 100, BC121: 100, BC128: 100, BC090: 100, BC091: 100, BC084: 50, BC085: 50, BC086: 50, BC160: 100, BC161: 100, BC162: 100, BC163: 100, BC164: 50, BC150: 50, BC153: 50, BC014: 0, BC024: 0, BC025: 0, BC026: 0 },
    sjms: { BC008: 100, BC009: 100, BC010: 100, BC011: 100, BC016: 100, BC028: 100, BC001: 100, BC002: 100, BC003: 100, BC006: 100, BC029: 100, BC030: 50, BC032: 50, BC033: 100, BC018: 50, BC102: 50, BC104: 50, BC013: 50, BC012: 50, BC153: 50, BC020: 50, BC128: 50, BC160: 50, BC161: 0, BC037: 50, BC017: 50, BC060: 50, BC071: 50, BC031: 50, BC034: 0, BC156: 0, BC233: 0, BC019: 0, BC137: 0, BC129: 100, BC121: 50, BC122: 100, BC086: 50, BC193: 50, BC090: 50, BC004: 50, BC005: 50, BC007: 50, BC035: 50, BC015: 50, BC022: 50, BC023: 50, BC039: 50, BC040: 0, BC084: 0, BC123: 100, BC124: 50, BC127: 50, BC162: 50, BC163: 0, BC150: 0, BC014: 50, BC024: 50, BC025: 50, BC026: 50, BC041: 50, BC038: 50, BC164: 0, BC110: 0, BC036: 50, BC021: 50, BC027: 50, BC172: 0, BC152: 50, BC226: 50 },
  };

  // Build all score records
  let scoreCount = 0;
  const allCodes = capabilitiesData.map(c => c.code);

  for (const [slug, scores] of Object.entries(rawScores)) {
    const systemId = systemMap[slug];
    if (!systemId) {
      console.warn(`System not found: ${slug}`);
      continue;
    }
    for (const code of allCodes) {
      const capId = capabilityMap[code];
      if (!capId) continue;
      const value = scores[code] ?? 0;
      await prisma.capabilityScore.create({
        data: {
          frameworkId: hermFramework.id,
          systemId,
          capabilityId: capId,
          value,
          version: 1,
          source: 'seed',
        },
      });
      scoreCount++;
    }
  }
  console.log(`Created ${scoreCount} scores`);

  // Vendor profiles, research items, and scoring methodology
  const { seedVendorProfiles } = await import('./seeds/vendor-profiles');
  await seedVendorProfiles(prisma);
  console.log('Vendor profiles seeded');

  // Phase 14.7 — FHE seeding now resolves cleanly. The cross-tree import
  // from server/src/data/fhe-framework that was tripping tsx ESM
  // resolution has been replaced with a colocated copy at
  // ./seeds/fhe-framework-data.ts, so the seeder is self-contained
  // within prisma/. Failures here are now genuine errors (e.g. DB
  // connectivity, schema drift) rather than module-resolution noise,
  // so we let them surface rather than swallowing them — a quiet
  // "FHE seeding skipped" used to mask the very state UAT D-01
  // surfaced (paid tier defaulting to a 0/0 framework).
  const { seedFheFramework } = await import('./seeds/fhe-framework');
  await seedFheFramework(prisma);
  console.log('FHE framework seeded');

  // Phase 14.7b — relocated fhe-scoring-rules / fhe-manual-scores /
  // herm-to-fhe-mapping data files into prisma/seeds/, so the
  // defensive try/catch that 14.7 left around scores + mappings is
  // no longer needed. Failures here are now genuine errors (DB
  // connectivity, schema drift) that should surface, not module-
  // resolution noise that masks them.
  const { seedFheScores } = await import('./seeds/fhe-scores');
  await seedFheScores(prisma);
  console.log('FHE scores seeded');

  const { seedFrameworkMappings } = await import('./seeds/framework-mappings');
  await seedFrameworkMappings(prisma);

  // ── Demo institution & user ──────────────────────────────────────────────
  const demoInstitution = await prisma.institution.upsert({
    where: { slug: 'demo-university' },
    update: {},
    create: {
      name: 'Demo University',
      slug: 'demo-university',
      country: 'UK',
      tier: 'professional',
    },
  });

  await prisma.subscription.upsert({
    where: { institutionId: demoInstitution.id },
    update: {},
    create: {
      institutionId: demoInstitution.id,
      tier: 'PROFESSIONAL',
      status: 'active',
    },
  });

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: 'demo@demo-university.ac.uk' },
    update: {},
    create: {
      email: 'demo@demo-university.ac.uk',
      name: 'Demo Admin',
      passwordHash: demoHash,
      role: 'INSTITUTION_ADMIN',
      institutionId: demoInstitution.id,
    },
  });
  console.log('Demo user seeded — demo@demo-university.ac.uk (password documented for local demos)');

  // ── UAT personas (Phase 11.17) ───────────────────────────────────────────
  // Each persona has their own login + institution + role so colleagues
  // running the testing brief from `docs/USER_TESTING_BRIEF.md` get a
  // realistic per-role experience instead of all four sharing the demo
  // admin account. Passwords default to the same `DEMO_PASSWORD` so a
  // single rotation flips them all.
  const personaHash = demoHash;

  // Priya — Russell Group HE, Enterprise tier (so Sector Analytics +
  // Framework Mapping render without DEV_UNLOCK_ALL_TIERS)
  const priyaInst = await prisma.institution.upsert({
    where: { slug: 'midshire-university' },
    update: {},
    create: {
      name: 'Midshire University',
      slug: 'midshire-university',
      country: 'UK',
      tier: 'enterprise',
    },
  });
  await prisma.subscription.upsert({
    where: { institutionId: priyaInst.id },
    update: {},
    create: { institutionId: priyaInst.id, tier: 'ENTERPRISE', status: 'active' },
  });
  await prisma.user.upsert({
    where: { email: 'priya@midshire.ac.uk' },
    // Rotate the hash on rerun so a DEMO_PASSWORD env change actually
    // takes effect for an already-seeded persona.
    update: { passwordHash: personaHash, role: 'PROCUREMENT_LEAD', institutionId: priyaInst.id },
    create: {
      email: 'priya@midshire.ac.uk',
      name: 'Priya Sharma',
      passwordHash: personaHash,
      role: 'PROCUREMENT_LEAD',
      institutionId: priyaInst.id,
    },
  });

  // Marcus — post-92 HE, Professional tier
  const marcusInst = await prisma.institution.upsert({
    where: { slug: 'newport-met' },
    update: {},
    create: {
      name: 'Newport Metropolitan University',
      slug: 'newport-met',
      country: 'UK',
      tier: 'professional',
    },
  });
  await prisma.subscription.upsert({
    where: { institutionId: marcusInst.id },
    update: {},
    create: { institutionId: marcusInst.id, tier: 'PROFESSIONAL', status: 'active' },
  });
  await prisma.user.upsert({
    where: { email: 'marcus@newport-met.ac.uk' },
    update: { passwordHash: personaHash, role: 'EVALUATOR', institutionId: marcusInst.id },
    create: {
      email: 'marcus@newport-met.ac.uk',
      name: 'Marcus Webb',
      passwordHash: personaHash,
      role: 'EVALUATOR',
      institutionId: marcusInst.id,
    },
  });

  // Rachel — FE college group, Enterprise tier (needs Framework Mapping)
  const rachelInst = await prisma.institution.upsert({
    where: { slug: 'wessex-colleges' },
    update: {},
    create: {
      name: 'Wessex Colleges Group',
      slug: 'wessex-colleges',
      country: 'UK',
      tier: 'enterprise',
    },
  });
  await prisma.subscription.upsert({
    where: { institutionId: rachelInst.id },
    update: {},
    create: { institutionId: rachelInst.id, tier: 'ENTERPRISE', status: 'active' },
  });
  await prisma.user.upsert({
    where: { email: 'rachel@wessex-colleges.ac.uk' },
    update: { passwordHash: personaHash, role: 'PROCUREMENT_LEAD', institutionId: rachelInst.id },
    create: {
      email: 'rachel@wessex-colleges.ac.uk',
      name: 'Rachel Okonkwo',
      passwordHash: personaHash,
      role: 'PROCUREMENT_LEAD',
      institutionId: rachelInst.id,
    },
  });

  // Daniel — vendor side. The vendor portal authenticates against the
  // separate VendorUser/VendorAccount tables (see vendor-portal.service
  // login flow), NOT the buyer-side User table. Seeding him as a User
  // with role VENDOR_ADMIN would let him through `/auth/login` but he
  // could not actually use the portal because the portal queries
  // `prisma.vendorUser`. So we create both halves of the vendor
  // identity here.
  //
  // PR #89 (the previous deploy seed) accidentally seeded Daniel as a
  // buyer User + Institution. On UAT databases that already ran that
  // seed, the row still exists and would let him through `/auth/login`
  // — defeating the "buyer login won't authenticate Daniel" promise we
  // make in DEPLOY.md. Clean it up before creating the vendor identity
  // so existing UAT environments converge to the new shape on rerun.
  await prisma.user.deleteMany({ where: { email: 'daniel@apex-software.com' } });
  await prisma.institution.deleteMany({ where: { slug: 'apex-software-vendor' } });

  const danielAccount = await prisma.vendorAccount.upsert({
    where: { contactEmail: 'daniel@apex-software.com' },
    update: { status: 'approved', tier: 'PREMIUM' },
    create: {
      companyName: 'Apex Software',
      contactEmail: 'daniel@apex-software.com',
      contactName: 'Daniel Hartley',
      websiteUrl: 'https://apex-software.example.com',
      description: 'UAT vendor persona — solutions architect for an HE SIS supplier.',
      status: 'approved',
      tier: 'PREMIUM',
      approvedAt: new Date(),
    },
  });
  await prisma.vendorUser.upsert({
    where: { email: 'daniel@apex-software.com' },
    update: { passwordHash: personaHash, role: 'admin', vendorAccountId: danielAccount.id },
    create: {
      email: 'daniel@apex-software.com',
      name: 'Daniel Hartley',
      passwordHash: personaHash,
      role: 'admin',
      vendorAccountId: danielAccount.id,
    },
  });

  console.log('UAT personas seeded:');
  console.log('  priya@midshire.ac.uk           PROCUREMENT_LEAD  Enterprise   (Russell Group HE)     /login');
  console.log('  marcus@newport-met.ac.uk       EVALUATOR         Professional (post-92 HE)           /login');
  console.log('  rachel@wessex-colleges.ac.uk   PROCUREMENT_LEAD  Enterprise   (FE college group)     /login');
  console.log('  daniel@apex-software.com       admin (vendor)    PREMIUM      (Apex Software)        /vendor-portal');
  console.log('  Password for all four: same as the demo user (DEMO_PASSWORD env or default).');
  console.log('  Note: Daniel logs in via the vendor portal (/vendor-portal renders the vendor sign-in form).');
  console.log('        The buyer /login page will not authenticate him.');

  // ── Demo capability basket ────────────────────────────────────────────────
  const demoBasket = await prisma.capabilityBasket.upsert({
    where: { id: 'demo-basket-001' },
    update: {},
    create: {
      id: 'demo-basket-001',
      name: 'Core SIS Evaluation',
      description: 'Standard basket for evaluating Student Information System capabilities across core HERM domains.',
      frameworkId: hermFramework.id,
      institutionId: demoInstitution.id,
      createdById: 'seed',
      isTemplate: false,
    },
  });

  // Add basket items for key capabilities — codes follow BC### pattern from HERM seed
  const coreCodes = ['BC008', 'BC009', 'BC011', 'BC016', 'BC029', 'BC028', 'BC060', 'BC090'];
  const coreCaps = await prisma.capability.findMany({
    where: { code: { in: coreCodes } },
    select: { id: true, code: true },
  });

  for (const cap of coreCaps) {
    await prisma.basketItem.upsert({
      where: { basketId_capabilityId: { basketId: demoBasket.id, capabilityId: cap.id } },
      update: {},
      create: {
        basketId: demoBasket.id,
        capabilityId: cap.id,
        priority: 'must',
        weight: 3,
      },
    });
  }
  console.log(`Demo basket seeded with ${coreCaps.length} capabilities`);

  // ── Demo procurement project ──────────────────────────────────────────────
  const demoProject = await prisma.procurementProject.upsert({
    where: { id: 'demo-project-001' },
    update: {},
    create: {
      id: 'demo-project-001',
      name: 'SIS Replacement Programme 2026',
      description: 'Full procurement exercise to replace the legacy student information system.',
      institutionId: demoInstitution.id,
      status: 'draft',
      basketId: demoBasket.id,
      jurisdiction: 'UK',
      estimatedValue: 2500000,
      procurementRoute: 'open',
    },
  });

  // UAT D-06 — Pipeline UI reads ProcurementStage rows; without these
  // the Pipeline tab on the demo project renders empty on first login.
  // We hardcode the 7-stage UK Procurement Act 2023 workflow here
  // (mirrors UK_STAGES in server/src/services/domain/procurement-engine.ts)
  // rather than importing the engine to keep the seed independent of
  // the server prisma singleton (the seed has its own PrismaClient).
  // The runtime equivalent fires for new projects via
  // procurement.service.ts:createProject() which DOES import the engine.
  const UK_DEMO_STAGES: Array<{ stageCode: string; stageName: string; stageOrder: number; status: 'IN_PROGRESS' | 'NOT_STARTED' }> = [
    { stageCode: 'PLANNING', stageName: 'Planning & Business Case', stageOrder: 1, status: 'IN_PROGRESS' },
    { stageCode: 'MARKET_ANALYSIS', stageName: 'Market Engagement', stageOrder: 2, status: 'NOT_STARTED' },
    { stageCode: 'SPECIFICATION', stageName: 'Requirements Specification', stageOrder: 3, status: 'NOT_STARTED' },
    // Stage names mirror UK_STAGES in
    // server/src/services/domain/procurement-engine.ts exactly so the
    // demo project's Pipeline cards match what users see on freshly-
    // created projects (which go through procurement.service.ts:createProject(),
    // which imports the engine). Copilot review on PR #100 noted three
    // names had drifted from the engine's source-of-truth strings.
    { stageCode: 'NOTICE', stageName: 'Tender Notice Publication', stageOrder: 4, status: 'NOT_STARTED' },
    { stageCode: 'EVALUATION', stageName: 'Tender Evaluation', stageOrder: 5, status: 'NOT_STARTED' },
    { stageCode: 'STANDSTILL', stageName: 'Mandatory Standstill Period', stageOrder: 6, status: 'NOT_STARTED' },
    { stageCode: 'AWARD', stageName: 'Contract Award', stageOrder: 7, status: 'NOT_STARTED' },
  ];
  for (const def of UK_DEMO_STAGES) {
    await prisma.procurementStage.upsert({
      where: { projectId_stageCode: { projectId: demoProject.id, stageCode: def.stageCode } },
      update: {},
      create: {
        projectId: demoProject.id,
        stageCode: def.stageCode,
        stageName: def.stageName,
        stageOrder: def.stageOrder,
        status: def.status,
      },
    });
  }
  console.log(`Demo procurement project seeded with ${UK_DEMO_STAGES.length} UK stages`);

  // ── Demo evaluation project (Team Workspaces source data) ────────────────
  // UAT reviewer reported Team Workspaces as a "stub" — the feature is
  // fully implemented (see client/src/pages/TeamWorkspaces.tsx) but had no
  // EvaluationProject seeded for the demo institution, so the four tabs
  // (Projects / Domain Assignment / Team Progress / Score Aggregation)
  // had no data to render. Seed one mid-flight project for Priya's
  // institution (Midshire) so the demo lands on populated tabs.
  const priyaUser = await prisma.user.findUnique({
    where: { email: 'priya@midshire.ac.uk' },
    select: { id: true, institutionId: true },
  });
  if (priyaUser) {
    const evalDeadline = new Date();
    evalDeadline.setDate(evalDeadline.getDate() + 30);
    // Copilot review on PR #100 — `update: {}` would let the
    // deadline drift into the past on every reseed against an existing
    // database, surfacing as an "OVERDUE" demo state in Team
    // Workspaces. Refresh `deadline` and `status` in the upsert update
    // block so Midshire always lands on a 30-days-out, in_progress
    // evaluation regardless of how many times the seed has run.
    const demoEval = await prisma.evaluationProject.upsert({
      where: { id: 'demo-evaluation-001' },
      update: { status: 'in_progress', deadline: evalDeadline },
      create: {
        id: 'demo-evaluation-001',
        name: 'SIS Replacement — Capability Evaluation',
        description: 'Team-led scoring of 3 shortlisted SIS vendors against the Core SIS basket.',
        frameworkId: hermFramework.id,
        institutionId: priyaUser.institutionId,
        leadUserId: priyaUser.id,
        status: 'in_progress',
        basketId: demoBasket.id,
        deadline: evalDeadline,
      },
    });
    await prisma.evaluationMember.upsert({
      where: { projectId_userId: { projectId: demoEval.id, userId: priyaUser.id } },
      update: {},
      create: {
        projectId: demoEval.id,
        userId: priyaUser.id,
        role: 'lead',
      },
    });
    console.log('Demo evaluation project seeded for Priya (Midshire)');
  } else {
    console.warn('Priya not found; skipping EvaluationProject seed');
  }

  console.log('Seeding complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
