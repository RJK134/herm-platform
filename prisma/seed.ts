import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding HERM platform...');

  // Clean slate — delete in dependency order
  await prisma.versionScore.deleteMany();
  await prisma.vendorVersion.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.score.deleteMany();
  await prisma.basketItem.deleteMany();
  await prisma.capabilityBasket.deleteMany();
  await prisma.hermCapability.deleteMany();
  await prisma.hermFamily.deleteMany();
  await prisma.shortlistEntry.deleteMany();
  await prisma.workflowStage.deleteMany();
  await prisma.procurementWorkflow.deleteMany();
  await prisma.procurementProject.deleteMany();
  await prisma.tcoEstimate.deleteMany();
  await prisma.integrationAssessment.deleteMany();
  await prisma.vendorSystem.deleteMany();

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

  const familyMap: Record<string, string> = {};
  for (const f of familiesData) {
    const fam = await prisma.hermFamily.create({ data: f });
    familyMap[f.code] = fam.id;
  }
  console.log(`Created ${familiesData.length} families`);

  // ── CAPABILITIES ──────────────────────────────────────────────────────────
  const capabilitiesData: Array<{ code: string; name: string; familyCode: string; sortOrder: number }> = [
    // Learning & Teaching (LT) — BC001-BC041
    { code: 'BC001', name: 'Curriculum Planning',                   familyCode: 'LT', sortOrder: 1  },
    { code: 'BC002', name: 'Curriculum Design',                     familyCode: 'LT', sortOrder: 2  },
    { code: 'BC003', name: 'Curriculum Production',                 familyCode: 'LT', sortOrder: 3  },
    { code: 'BC004', name: 'Curriculum Review',                     familyCode: 'LT', sortOrder: 4  },
    { code: 'BC005', name: 'Curriculum Accreditation',              familyCode: 'LT', sortOrder: 5  },
    { code: 'BC006', name: 'Programme of Learning Design',          familyCode: 'LT', sortOrder: 6  },
    { code: 'BC007', name: 'Programme of Learning Accreditation',   familyCode: 'LT', sortOrder: 7  },
    { code: 'BC008', name: 'Student Recruitment',                   familyCode: 'LT', sortOrder: 8  },
    { code: 'BC009', name: 'Admissions Management',                 familyCode: 'LT', sortOrder: 9  },
    { code: 'BC010', name: 'Student Onboarding',                    familyCode: 'LT', sortOrder: 10 },
    { code: 'BC011', name: 'Enrolment',                             familyCode: 'LT', sortOrder: 11 },
    { code: 'BC012', name: 'Student Allocation',                    familyCode: 'LT', sortOrder: 12 },
    { code: 'BC013', name: 'Timetabling',                           familyCode: 'LT', sortOrder: 13 },
    { code: 'BC014', name: 'Learning & Teaching Delivery',          familyCode: 'LT', sortOrder: 14 },
    { code: 'BC015', name: 'Student Attendance Management',         familyCode: 'LT', sortOrder: 15 },
    { code: 'BC016', name: 'Student Progress Management',           familyCode: 'LT', sortOrder: 16 },
    { code: 'BC017', name: 'Student Wellbeing Management',          familyCode: 'LT', sortOrder: 17 },
    { code: 'BC018', name: 'Student Financial Support',             familyCode: 'LT', sortOrder: 18 },
    { code: 'BC019', name: 'Student Accommodation Management',      familyCode: 'LT', sortOrder: 19 },
    { code: 'BC020', name: 'Student Engagement Management',         familyCode: 'LT', sortOrder: 20 },
    { code: 'BC021', name: 'Student Employability Management',      familyCode: 'LT', sortOrder: 21 },
    { code: 'BC022', name: 'Student Conduct Management',            familyCode: 'LT', sortOrder: 22 },
    { code: 'BC023', name: 'Student Accessibility & Inclusion',     familyCode: 'LT', sortOrder: 23 },
    { code: 'BC024', name: 'Learning & Teaching Resource Preparation', familyCode: 'LT', sortOrder: 24 },
    { code: 'BC025', name: 'Learning & Teaching Resource Management',  familyCode: 'LT', sortOrder: 25 },
    { code: 'BC026', name: 'Learning Environment Management',       familyCode: 'LT', sortOrder: 26 },
    { code: 'BC027', name: 'Work-Integrated Learning',              familyCode: 'LT', sortOrder: 27 },
    { code: 'BC028', name: 'Credit Management',                     familyCode: 'LT', sortOrder: 28 },
    { code: 'BC029', name: 'Learning Assessment',                   familyCode: 'LT', sortOrder: 29 },
    { code: 'BC030', name: 'Learning Assessment Moderation',        familyCode: 'LT', sortOrder: 30 },
    { code: 'BC031', name: 'Student Research Assessment',           familyCode: 'LT', sortOrder: 31 },
    { code: 'BC032', name: 'Academic Integrity Management',         familyCode: 'LT', sortOrder: 32 },
    { code: 'BC033', name: 'Graduation & Completion',               familyCode: 'LT', sortOrder: 33 },
    { code: 'BC034', name: 'Alumni Management',                     familyCode: 'LT', sortOrder: 34 },
    { code: 'BC035', name: 'Learning & Teaching Quality Assurance', familyCode: 'LT', sortOrder: 35 },
    { code: 'BC036', name: 'Student Feedback Management',           familyCode: 'LT', sortOrder: 36 },
    { code: 'BC037', name: 'Learning Analytics',                    familyCode: 'LT', sortOrder: 37 },
    { code: 'BC038', name: 'Micro-credential Management',           familyCode: 'LT', sortOrder: 38 },
    { code: 'BC039', name: 'Recognition of Prior Learning',         familyCode: 'LT', sortOrder: 39 },
    { code: 'BC040', name: 'Student Exchange Management',           familyCode: 'LT', sortOrder: 40 },
    { code: 'BC041', name: 'Curriculum Disestablishment',           familyCode: 'LT', sortOrder: 41 },

    // Research (RE) — BC050-BC074
    { code: 'BC050', name: 'Research Strategy Management',          familyCode: 'RE', sortOrder: 50 },
    { code: 'BC051', name: 'Research Funding Management',           familyCode: 'RE', sortOrder: 51 },
    { code: 'BC052', name: 'Research Partnership Management',       familyCode: 'RE', sortOrder: 52 },
    { code: 'BC053', name: 'Research Ethics Management',            familyCode: 'RE', sortOrder: 53 },
    { code: 'BC054', name: 'Research Compliance Management',        familyCode: 'RE', sortOrder: 54 },
    { code: 'BC055', name: 'Research Programme Management',         familyCode: 'RE', sortOrder: 55 },
    { code: 'BC056', name: 'Research Project Management',           familyCode: 'RE', sortOrder: 56 },
    { code: 'BC057', name: 'Research Data Management',              familyCode: 'RE', sortOrder: 57 },
    { code: 'BC058', name: 'Research Infrastructure Management',    familyCode: 'RE', sortOrder: 58 },
    { code: 'BC059', name: 'Research Resource Management',          familyCode: 'RE', sortOrder: 59 },
    { code: 'BC060', name: 'Research Supervision',                  familyCode: 'RE', sortOrder: 60 },
    { code: 'BC061', name: 'Research Output Management',            familyCode: 'RE', sortOrder: 61 },
    { code: 'BC062', name: 'Research Publication Management',       familyCode: 'RE', sortOrder: 62 },
    { code: 'BC063', name: 'Research Commercialisation',            familyCode: 'RE', sortOrder: 63 },
    { code: 'BC064', name: 'Research Impact Assessment',            familyCode: 'RE', sortOrder: 64 },
    { code: 'BC065', name: 'Research Performance Management',       familyCode: 'RE', sortOrder: 65 },
    { code: 'BC066', name: 'Research Recognition & Awards',         familyCode: 'RE', sortOrder: 66 },
    { code: 'BC067', name: 'Knowledge Transfer',                    familyCode: 'RE', sortOrder: 67 },
    { code: 'BC068', name: 'Innovation Management',                 familyCode: 'RE', sortOrder: 68 },
    { code: 'BC069', name: 'Open Access Management',                familyCode: 'RE', sortOrder: 69 },
    { code: 'BC070', name: 'Research Integrity Management',         familyCode: 'RE', sortOrder: 70 },
    { code: 'BC071', name: 'HDR Candidature Management',            familyCode: 'RE', sortOrder: 71 },
    { code: 'BC072', name: 'Research Collaboration Platform Management', familyCode: 'RE', sortOrder: 72 },
    { code: 'BC073', name: 'Bibliometric Analysis',                 familyCode: 'RE', sortOrder: 73 },
    { code: 'BC074', name: 'Research Reporting',                    familyCode: 'RE', sortOrder: 74 },

    // Strategy & Governance (SG) — BC080-BC091
    { code: 'BC080', name: 'Vision & Strategy Management',          familyCode: 'SG', sortOrder: 80 },
    { code: 'BC081', name: 'Strategic Plan Management',             familyCode: 'SG', sortOrder: 81 },
    { code: 'BC082', name: 'Business Capability Management',        familyCode: 'SG', sortOrder: 82 },
    { code: 'BC083', name: 'Enterprise Architecture',               familyCode: 'SG', sortOrder: 83 },
    { code: 'BC084', name: 'Policy Management',                     familyCode: 'SG', sortOrder: 84 },
    { code: 'BC085', name: 'Risk Management',                       familyCode: 'SG', sortOrder: 85 },
    { code: 'BC086', name: 'Compliance Management',                 familyCode: 'SG', sortOrder: 86 },
    { code: 'BC087', name: 'Audit Management',                      familyCode: 'SG', sortOrder: 87 },
    { code: 'BC088', name: 'Quality Assurance Management',          familyCode: 'SG', sortOrder: 88 },
    { code: 'BC089', name: 'Benefits Management',                   familyCode: 'SG', sortOrder: 89 },
    { code: 'BC090', name: 'Organisational Design',                 familyCode: 'SG', sortOrder: 90 },
    { code: 'BC091', name: 'Performance Management',                familyCode: 'SG', sortOrder: 91 },

    // Financial Management (FM) — BC100-BC110, BC194
    { code: 'BC100', name: 'Financial Planning & Budgeting',        familyCode: 'FM', sortOrder: 100 },
    { code: 'BC101', name: 'Accounts Payable',                      familyCode: 'FM', sortOrder: 101 },
    { code: 'BC102', name: 'Accounts Receivable',                   familyCode: 'FM', sortOrder: 102 },
    { code: 'BC103', name: 'General Accounting',                    familyCode: 'FM', sortOrder: 103 },
    { code: 'BC104', name: 'Price Modelling',                       familyCode: 'FM', sortOrder: 104 },
    { code: 'BC105', name: 'Tax Management',                        familyCode: 'FM', sortOrder: 105 },
    { code: 'BC106', name: 'Payroll Management',                    familyCode: 'FM', sortOrder: 106 },
    { code: 'BC107', name: 'Treasury Management',                   familyCode: 'FM', sortOrder: 107 },
    { code: 'BC108', name: 'Investment Management',                 familyCode: 'FM', sortOrder: 108 },
    { code: 'BC109', name: 'Asset Management',                      familyCode: 'FM', sortOrder: 109 },
    { code: 'BC110', name: 'Procurement Management',                familyCode: 'FM', sortOrder: 110 },
    { code: 'BC194', name: 'Project Accounting',                    familyCode: 'FM', sortOrder: 194 },

    // Human Resource Management (HR) — BC170-BC182
    { code: 'BC170', name: 'Organisational Workforce Planning',     familyCode: 'HR', sortOrder: 170 },
    { code: 'BC171', name: 'Talent Acquisition',                    familyCode: 'HR', sortOrder: 171 },
    { code: 'BC172', name: 'Workforce Resource Management',         familyCode: 'HR', sortOrder: 172 },
    { code: 'BC173', name: 'Workforce Relations Management',        familyCode: 'HR', sortOrder: 173 },
    { code: 'BC174', name: 'Workforce Performance Management',      familyCode: 'HR', sortOrder: 174 },
    { code: 'BC175', name: 'Remuneration & Benefits Management',    familyCode: 'HR', sortOrder: 175 },
    { code: 'BC176', name: 'Workforce Support Management',          familyCode: 'HR', sortOrder: 176 },
    { code: 'BC177', name: 'Leave Management',                      familyCode: 'HR', sortOrder: 177 },
    { code: 'BC178', name: 'Workforce Separation Management',       familyCode: 'HR', sortOrder: 178 },
    { code: 'BC182', name: 'Workforce Training & Development',      familyCode: 'HR', sortOrder: 182 },

    // ICT Management (ICT) — BC120-BC130
    { code: 'BC120', name: 'ICT Strategy & Planning',               familyCode: 'ICT', sortOrder: 120 },
    { code: 'BC121', name: 'Application Management',                familyCode: 'ICT', sortOrder: 121 },
    { code: 'BC122', name: 'Infrastructure Management',             familyCode: 'ICT', sortOrder: 122 },
    { code: 'BC123', name: 'Identity & Access Management',          familyCode: 'ICT', sortOrder: 123 },
    { code: 'BC124', name: 'Information Security Management',       familyCode: 'ICT', sortOrder: 124 },
    { code: 'BC125', name: 'Service Management',                    familyCode: 'ICT', sortOrder: 125 },
    { code: 'BC126', name: 'Enterprise Content Management',         familyCode: 'ICT', sortOrder: 126 },
    { code: 'BC127', name: 'Records Management',                    familyCode: 'ICT', sortOrder: 127 },
    { code: 'BC128', name: 'Digital Workplace Management',          familyCode: 'ICT', sortOrder: 128 },
    { code: 'BC129', name: 'Data Integration & Interoperability',   familyCode: 'ICT', sortOrder: 129 },
    { code: 'BC130', name: 'ICT Vendor Management',                 familyCode: 'ICT', sortOrder: 130 },

    // Facilities & Estate Management (FE)
    { code: 'BC116', name: 'Gallery & Museum Management',           familyCode: 'FE', sortOrder: 116 },
    { code: 'BC117', name: 'Childcare Management',                  familyCode: 'FE', sortOrder: 117 },
    { code: 'BC118', name: 'Healthcare Management',                 familyCode: 'FE', sortOrder: 118 },
    { code: 'BC131', name: 'Cleaning & Waste Management',           familyCode: 'FE', sortOrder: 131 },
    { code: 'BC132', name: 'Facilities Maintenance Management',     familyCode: 'FE', sortOrder: 132 },
    { code: 'BC133', name: 'Property Management',                   familyCode: 'FE', sortOrder: 133 },
    { code: 'BC134', name: 'Collection Access Management',          familyCode: 'FE', sortOrder: 134 },
    { code: 'BC135', name: 'Campus Transportation Management',      familyCode: 'FE', sortOrder: 135 },
    { code: 'BC136', name: 'Information Governance',                familyCode: 'FE', sortOrder: 136 },
    { code: 'BC137', name: 'Campus Housing & Accommodation Management', familyCode: 'FE', sortOrder: 137 },
    { code: 'BC138', name: 'Space Utilisation Management',          familyCode: 'FE', sortOrder: 138 },
    { code: 'BC139', name: 'Campus Security Management',            familyCode: 'FE', sortOrder: 139 },
    { code: 'BC140', name: 'Groundskeeping Management',             familyCode: 'FE', sortOrder: 140 },
    { code: 'BC141', name: 'Environmental Sustainability Management', familyCode: 'FE', sortOrder: 141 },
    { code: 'BC142', name: 'Health Safety & Wellbeing Management',  familyCode: 'FE', sortOrder: 142 },

    // Engagement & Communication (EC)
    { code: 'BC150', name: 'Communications Management',             familyCode: 'EC', sortOrder: 150 },
    { code: 'BC151', name: 'Engagement Management',                 familyCode: 'EC', sortOrder: 151 },
    { code: 'BC152', name: 'Relationship Management',               familyCode: 'EC', sortOrder: 152 },
    { code: 'BC153', name: 'Customer Experience Management',        familyCode: 'EC', sortOrder: 153 },
    { code: 'BC154', name: 'Event Management',                      familyCode: 'EC', sortOrder: 154 },
    { code: 'BC155', name: 'Venue Management',                      familyCode: 'EC', sortOrder: 155 },
    { code: 'BC156', name: 'Fundraising & Development',             familyCode: 'EC', sortOrder: 156 },
    { code: 'BC157', name: 'Brand Management',                      familyCode: 'EC', sortOrder: 157 },
    { code: 'BC158', name: 'Media Production Management',           familyCode: 'EC', sortOrder: 158 },
    { code: 'BC166', name: 'Complaint & Compliment Management',     familyCode: 'EC', sortOrder: 166 },
    { code: 'BC233', name: 'Donor Sponsor & Philanthropist Management', familyCode: 'EC', sortOrder: 233 },

    // Information Management (IM) — BC160-BC164
    { code: 'BC160', name: 'Business Intelligence & Reporting',     familyCode: 'IM', sortOrder: 160 },
    { code: 'BC161', name: 'Advanced Analytics',                    familyCode: 'IM', sortOrder: 161 },
    { code: 'BC162', name: 'Data Management',                       familyCode: 'IM', sortOrder: 162 },
    { code: 'BC163', name: 'Data Governance',                       familyCode: 'IM', sortOrder: 163 },
    { code: 'BC164', name: 'Institutional Research',                familyCode: 'IM', sortOrder: 164 },

    // Legal & Compliance (LC)
    { code: 'BC190', name: 'Legal Advisory',                        familyCode: 'LC', sortOrder: 190 },
    { code: 'BC191', name: 'Contract Management',                   familyCode: 'LC', sortOrder: 191 },
    { code: 'BC192', name: 'Intellectual Property Management',      familyCode: 'LC', sortOrder: 192 },
    { code: 'BC193', name: 'Regulatory Affairs Management',         familyCode: 'LC', sortOrder: 193 },
    { code: 'BC226', name: 'Student Grievance Management',          familyCode: 'LC', sortOrder: 226 },

    // Supporting Services (SS) — BC200-BC217
    { code: 'BC200', name: 'Project Management',                    familyCode: 'SS', sortOrder: 200 },
    { code: 'BC201', name: 'Programme Management',                  familyCode: 'SS', sortOrder: 201 },
    { code: 'BC202', name: 'Business Process Management',           familyCode: 'SS', sortOrder: 202 },
    { code: 'BC203', name: 'Change Management',                     familyCode: 'SS', sortOrder: 203 },
    { code: 'BC204', name: 'Commercial Tenancy Management',         familyCode: 'SS', sortOrder: 204 },
    { code: 'BC205', name: 'Retail Management',                     familyCode: 'SS', sortOrder: 205 },
    { code: 'BC206', name: 'Travel Management',                     familyCode: 'SS', sortOrder: 206 },
    { code: 'BC207', name: 'Printing Management',                   familyCode: 'SS', sortOrder: 207 },
    { code: 'BC208', name: 'Mail Management',                       familyCode: 'SS', sortOrder: 208 },
    { code: 'BC209', name: 'Membership Management',                 familyCode: 'SS', sortOrder: 209 },
    { code: 'BC210', name: 'Sport & Recreation Management',         familyCode: 'SS', sortOrder: 210 },
    { code: 'BC211', name: 'Intercollegiate Athletics Management',  familyCode: 'SS', sortOrder: 211 },
    { code: 'BC212', name: 'Fleet Management',                      familyCode: 'SS', sortOrder: 212 },
    { code: 'BC213', name: 'Artefact & Collection Management',      familyCode: 'SS', sortOrder: 213 },
    { code: 'BC214', name: 'Digital Preservation Management',       familyCode: 'SS', sortOrder: 214 },
    { code: 'BC215', name: 'Library Management',                    familyCode: 'SS', sortOrder: 215 },
    { code: 'BC216', name: 'Insurance Management',                  familyCode: 'SS', sortOrder: 216 },
    { code: 'BC217', name: 'Service Level Management',              familyCode: 'SS', sortOrder: 217 },
  ];

  const capabilityMap: Record<string, string> = {};
  for (const c of capabilitiesData) {
    const cap = await prisma.hermCapability.create({
      data: {
        code: c.code,
        name: c.name,
        familyId: familyMap[c.familyCode],
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
      await prisma.score.create({
        data: {
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

  const demoHash = await bcrypt.hash('demo12345', 10);
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
  console.log('Demo user seeded — demo@demo-university.ac.uk / demo12345');

  // ── Demo capability basket ────────────────────────────────────────────────
  const demoBasket = await prisma.capabilityBasket.upsert({
    where: { id: 'demo-basket-001' },
    update: {},
    create: {
      id: 'demo-basket-001',
      name: 'Core SIS Evaluation',
      description: 'Standard basket for evaluating Student Information System capabilities across core HERM families.',
      institutionId: demoInstitution.id,
      createdById: 'seed',
      isTemplate: false,
    },
  });

  // Add basket items for key capabilities — codes follow BC### pattern from HERM seed
  const coreCodes = ['BC008', 'BC009', 'BC011', 'BC016', 'BC029', 'BC028', 'BC060', 'BC090'];
  const coreCaps = await prisma.hermCapability.findMany({
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
  await prisma.procurementProject.upsert({
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
  console.log('Demo procurement project seeded');

  console.log('Seeding complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
