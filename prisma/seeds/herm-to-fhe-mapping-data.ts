// prisma/seeds/herm-to-fhe-mapping-data.ts
// HERM v3.1 → FHE Capability Framework v1.0 cross-framework mapping.
//
// Each entry links a HERM Business Capability (BCxxx) to a corresponding
// FHE capability (FHE-XX-NNN). Strength reflects semantic closeness of the
// two capabilities, and confidence (0-100) reflects reviewer certainty.
//
// Coverage summary:
//   ~20 exact   — capabilities whose intent and scope overlap almost completely
//   ~40 strong  — capabilities whose intent substantially overlaps
//   ~30 partial — capabilities with meaningful but incomplete overlap
//   ~10 weak    — capabilities sharing only tangential concerns
//
// Phase 14.7b — relocated from server/src/data/herm-to-fhe-mapping.ts.
// Seed-only at runtime: consumed by prisma/seeds/framework-mappings.ts
// during `npm run db:seed`, which writes the mapping into
// FrameworkMapping + CapabilityMapping rows. The server-side
// /api/framework-mappings endpoints read those rows from the DB —
// they don't import this module — so the relocation is safe.

export type MappingStrength = 'exact' | 'strong' | 'partial' | 'weak';

export type CapabilityMappingDefinition = {
  sourceCode: string;      // HERM code, e.g. 'BC008'
  targetCode: string;      // FHE code, e.g. 'FHE-SL-001'
  strength: MappingStrength;
  confidence: number;      // 0-100
  notes?: string;
};

export const HERM_TO_FHE_MAPPINGS: CapabilityMappingDefinition[] = [
  // ══════════════════════════════════════════════════════════════════════
  // Learning & Teaching (LT) → Digital Learning (DL) + Student Lifecycle (SL)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC001', targetCode: 'FHE-DL-014', strength: 'partial', confidence: 65, notes: 'Curriculum Planning overlaps with competency mapping and skills tagging for programme design.' },
  { sourceCode: 'BC002', targetCode: 'FHE-DL-006', strength: 'partial', confidence: 60, notes: 'Curriculum Design partially maps to adaptive pathway configuration within module delivery.' },
  { sourceCode: 'BC003', targetCode: 'FHE-DL-002', strength: 'strong', confidence: 80, notes: 'Curriculum Production aligns with digital content authoring pipeline and reusable learning objects.' },
  { sourceCode: 'BC004', targetCode: 'FHE-GR-001', strength: 'partial', confidence: 55, notes: 'Curriculum Review shares governance lifecycle concerns with policy stewardship.' },
  { sourceCode: 'BC005', targetCode: 'FHE-GR-012', strength: 'partial', confidence: 60, notes: 'Curriculum Accreditation partially maps to regulatory return compliance tracking.' },
  { sourceCode: 'BC006', targetCode: 'FHE-DL-014', strength: 'strong', confidence: 75, notes: 'Programme of Learning Design aligns with competency mapping and learning-outcome tagging.' },
  { sourceCode: 'BC007', targetCode: 'FHE-GR-012', strength: 'partial', confidence: 55, notes: 'Programme Accreditation aligns partially with statutory return tracking.' },
  { sourceCode: 'BC008', targetCode: 'FHE-SL-001', strength: 'strong', confidence: 85, notes: 'Student Recruitment maps to prospect pipeline orchestration across channels.' },
  { sourceCode: 'BC009', targetCode: 'FHE-SL-002', strength: 'exact', confidence: 95, notes: 'Admissions Management is a direct match for offer processing and condition tracking.' },
  { sourceCode: 'BC010', targetCode: 'FHE-SL-003', strength: 'exact', confidence: 95, notes: 'Student Onboarding maps directly to onboarding workflow automation.' },
  { sourceCode: 'BC011', targetCode: 'FHE-SL-004', strength: 'exact', confidence: 95, notes: 'Enrolment maps directly to the Registration & Enrolment Engine.' },
  { sourceCode: 'BC012', targetCode: 'FHE-SL-015', strength: 'strong', confidence: 80, notes: 'Student Allocation aligns with timetable slot allocation and cohort placement.' },
  { sourceCode: 'BC013', targetCode: 'FHE-SL-015', strength: 'exact', confidence: 95, notes: 'Timetabling is a direct match for the timetable slot allocation engine.' },
  { sourceCode: 'BC014', targetCode: 'FHE-DL-001', strength: 'strong', confidence: 80, notes: 'Learning & Teaching Delivery aligns with VLE provisioning and delivery infrastructure.' },
  { sourceCode: 'BC015', targetCode: 'FHE-SL-009', strength: 'exact', confidence: 95, notes: 'Student Attendance Management is a direct match for attendance & engagement capture.' },
  { sourceCode: 'BC016', targetCode: 'FHE-SL-005', strength: 'exact', confidence: 95, notes: 'Student Progress Management is a direct match for the progress monitoring framework.' },
  { sourceCode: 'BC017', targetCode: 'FHE-SL-016', strength: 'strong', confidence: 85, notes: 'Student Wellbeing Management aligns with welfare case coordination.' },
  { sourceCode: 'BC018', targetCode: 'FHE-SL-013', strength: 'strong', confidence: 80, notes: 'Student Financial Support aligns with sponsorship & fee-payer liaison workflows.' },
  { sourceCode: 'BC019', targetCode: 'FHE-SL-003', strength: 'partial', confidence: 55, notes: 'Student Accommodation Management overlaps with onboarding pre-arrival accommodation allocation.' },
  { sourceCode: 'BC020', targetCode: 'FHE-DL-003', strength: 'strong', confidence: 75, notes: 'Student Engagement Management aligns with learner analytics instrumentation and telemetry.' },
  { sourceCode: 'BC021', targetCode: 'FHE-SL-010', strength: 'strong', confidence: 80, notes: 'Student Employability Management aligns with placement & work-based learning coordination.' },
  { sourceCode: 'BC022', targetCode: 'FHE-GR-010', strength: 'partial', confidence: 60, notes: 'Student Conduct Management overlaps with disclosure and misconduct handling.' },
  { sourceCode: 'BC023', targetCode: 'FHE-DL-011', strength: 'strong', confidence: 80, notes: 'Student Accessibility & Inclusion maps to the accessibility compliance engine.' },
  { sourceCode: 'BC024', targetCode: 'FHE-DL-002', strength: 'strong', confidence: 75, notes: 'Learning & Teaching Resource Preparation aligns with digital content authoring pipeline.' },
  { sourceCode: 'BC025', targetCode: 'FHE-DL-012', strength: 'strong', confidence: 75, notes: 'Learning & Teaching Resource Management aligns with LTI & EdTech connector hub management.' },
  { sourceCode: 'BC026', targetCode: 'FHE-DL-013', strength: 'strong', confidence: 75, notes: 'Learning Environment Management aligns with simulation and virtual lab hosting.' },
  { sourceCode: 'BC027', targetCode: 'FHE-SL-010', strength: 'exact', confidence: 95, notes: 'Work-Integrated Learning is a direct match for placement & work-based learning coordination.' },
  { sourceCode: 'BC028', targetCode: 'FHE-SL-014', strength: 'strong', confidence: 80, notes: 'Credit Management aligns with prior experiential learning evaluation and credit awarding.' },
  { sourceCode: 'BC029', targetCode: 'FHE-DL-004', strength: 'exact', confidence: 95, notes: 'Learning Assessment maps directly to the assessment engine orchestration.' },
  { sourceCode: 'BC030', targetCode: 'FHE-DL-004', strength: 'strong', confidence: 80, notes: 'Assessment Moderation aligns with assessment engine lifecycle governance.' },
  { sourceCode: 'BC031', targetCode: 'FHE-RO-007', strength: 'strong', confidence: 75, notes: 'Student Research Assessment aligns with doctoral candidature milestone tracking.' },
  { sourceCode: 'BC032', targetCode: 'FHE-DL-005', strength: 'exact', confidence: 95, notes: 'Academic Integrity Management maps directly to academic integrity tooling.' },
  { sourceCode: 'BC033', targetCode: 'FHE-SL-007', strength: 'exact', confidence: 95, notes: 'Graduation & Completion maps directly to award conferral processing.' },
  { sourceCode: 'BC034', targetCode: 'FHE-SL-008', strength: 'strong', confidence: 80, notes: 'Alumni Management aligns with post-completion engagement tracking.' },
  { sourceCode: 'BC035', targetCode: 'FHE-II-008', strength: 'strong', confidence: 75, notes: 'L&T Quality Assurance aligns with survey & feedback aggregation (NSS, PTES).' },
  { sourceCode: 'BC036', targetCode: 'FHE-II-008', strength: 'exact', confidence: 90, notes: 'Student Feedback Management is a direct match for survey & feedback aggregation.' },
  { sourceCode: 'BC037', targetCode: 'FHE-DL-003', strength: 'exact', confidence: 95, notes: 'Learning Analytics maps directly to learner analytics instrumentation.' },
  { sourceCode: 'BC038', targetCode: 'FHE-DL-007', strength: 'exact', confidence: 95, notes: 'Micro-credential Management is a direct match for micro-credential issuance platform.' },
  { sourceCode: 'BC039', targetCode: 'FHE-SL-014', strength: 'exact', confidence: 95, notes: 'Recognition of Prior Learning maps directly to prior experiential learning evaluation.' },
  { sourceCode: 'BC040', targetCode: 'FHE-SL-011', strength: 'exact', confidence: 95, notes: 'Student Exchange Management maps directly to international mobility administration.' },
  { sourceCode: 'BC041', targetCode: 'FHE-GR-001', strength: 'weak', confidence: 40, notes: 'Curriculum Disestablishment shares only governance end-of-life concerns.' },

  // ══════════════════════════════════════════════════════════════════════
  // Research (RE) → Research Operations (RO)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC050', targetCode: 'FHE-RO-015', strength: 'strong', confidence: 80, notes: 'Research Strategy Management aligns with the research performance scorecard.' },
  { sourceCode: 'BC051', targetCode: 'FHE-RO-001', strength: 'exact', confidence: 95, notes: 'Research Funding Management maps directly to grant lifecycle orchestration.' },
  { sourceCode: 'BC052', targetCode: 'FHE-RO-009', strength: 'strong', confidence: 85, notes: 'Research Partnership Management aligns with the collaboration agreement broker.' },
  { sourceCode: 'BC053', targetCode: 'FHE-RO-002', strength: 'exact', confidence: 95, notes: 'Research Ethics Management is a direct match for ethics approval workflow.' },
  { sourceCode: 'BC054', targetCode: 'FHE-RO-013', strength: 'strong', confidence: 85, notes: 'Research Compliance Management aligns with research integrity assurance.' },
  { sourceCode: 'BC055', targetCode: 'FHE-RO-001', strength: 'strong', confidence: 75, notes: 'Research Programme Management aligns with grant lifecycle portfolio oversight.' },
  { sourceCode: 'BC056', targetCode: 'FHE-RO-008', strength: 'strong', confidence: 75, notes: 'Research Project Management aligns with research costing & pricing engine.' },
  { sourceCode: 'BC057', targetCode: 'FHE-RO-006', strength: 'exact', confidence: 95, notes: 'Research Data Management maps directly to research data stewardship.' },
  { sourceCode: 'BC058', targetCode: 'FHE-RO-011', strength: 'strong', confidence: 85, notes: 'Research Infrastructure Management aligns with research equipment & facility booking.' },
  { sourceCode: 'BC059', targetCode: 'FHE-RO-011', strength: 'partial', confidence: 60, notes: 'Research Resource Management overlaps with research equipment booking scope.' },
  { sourceCode: 'BC060', targetCode: 'FHE-RO-007', strength: 'exact', confidence: 95, notes: 'Research Supervision maps directly to doctoral candidature administration.' },
  { sourceCode: 'BC061', targetCode: 'FHE-RO-003', strength: 'exact', confidence: 95, notes: 'Research Output Management maps directly to institutional repository & discovery.' },
  { sourceCode: 'BC062', targetCode: 'FHE-RO-003', strength: 'strong', confidence: 85, notes: 'Research Publication Management aligns with repository-based output curation.' },
  { sourceCode: 'BC063', targetCode: 'FHE-RO-005', strength: 'exact', confidence: 95, notes: 'Research Commercialisation maps directly to commercialisation & spin-out pipeline.' },
  { sourceCode: 'BC064', targetCode: 'FHE-RO-004', strength: 'exact', confidence: 95, notes: 'Research Impact Assessment is a direct match for societal impact evidence collation.' },
  { sourceCode: 'BC065', targetCode: 'FHE-RO-015', strength: 'exact', confidence: 90, notes: 'Research Performance Management maps directly to the research performance scorecard.' },
  { sourceCode: 'BC067', targetCode: 'FHE-RO-014', strength: 'exact', confidence: 95, notes: 'Knowledge Transfer maps directly to the knowledge exchange & consultancy ledger.' },
  { sourceCode: 'BC068', targetCode: 'FHE-RO-005', strength: 'strong', confidence: 75, notes: 'Innovation Management aligns with commercialisation and spin-out pipeline scope.' },
  { sourceCode: 'BC069', targetCode: 'FHE-RO-012', strength: 'exact', confidence: 95, notes: 'Open Access Management maps directly to the open-access compliance monitor.' },
  { sourceCode: 'BC070', targetCode: 'FHE-RO-013', strength: 'exact', confidence: 95, notes: 'Research Integrity Management is a direct match for research integrity assurance.' },
  { sourceCode: 'BC071', targetCode: 'FHE-RO-007', strength: 'strong', confidence: 85, notes: 'HDR Candidature Management aligns with doctoral candidature administration.' },
  { sourceCode: 'BC073', targetCode: 'FHE-RO-010', strength: 'exact', confidence: 95, notes: 'Bibliometric Analysis maps directly to bibliometric & citation tracking.' },
  { sourceCode: 'BC074', targetCode: 'FHE-RO-015', strength: 'strong', confidence: 80, notes: 'Research Reporting aligns with the research performance scorecard.' },

  // ══════════════════════════════════════════════════════════════════════
  // Strategy & Governance (SG) → Governance Risk & Compliance (GR)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC080', targetCode: 'FHE-GR-009', strength: 'partial', confidence: 55, notes: 'Vision & Strategy Management shares governance decision-making with the committee engine.' },
  { sourceCode: 'BC081', targetCode: 'FHE-GR-009', strength: 'partial', confidence: 55, notes: 'Strategic Plan Management shares governance cadence with the committee engine.' },
  { sourceCode: 'BC083', targetCode: 'FHE-ET-006', strength: 'partial', confidence: 60, notes: 'Enterprise Architecture overlaps with integration hub & event bus design.' },
  { sourceCode: 'BC084', targetCode: 'FHE-GR-001', strength: 'exact', confidence: 95, notes: 'Policy Management maps directly to policy lifecycle stewardship.' },
  { sourceCode: 'BC085', targetCode: 'FHE-GR-004', strength: 'exact', confidence: 95, notes: 'Risk Management is a direct match for the enterprise risk register.' },
  { sourceCode: 'BC086', targetCode: 'FHE-GR-005', strength: 'strong', confidence: 85, notes: 'Compliance Management aligns with the compliance evidence vault.' },
  { sourceCode: 'BC087', targetCode: 'FHE-GR-003', strength: 'exact', confidence: 95, notes: 'Audit Management maps directly to internal audit scheduling & tracking.' },
  { sourceCode: 'BC088', targetCode: 'FHE-GR-012', strength: 'strong', confidence: 80, notes: 'Quality Assurance Management aligns with regulatory return compliance tracking.' },
  { sourceCode: 'BC091', targetCode: 'FHE-II-010', strength: 'strong', confidence: 75, notes: 'Performance Management aligns with regulatory metric computation (TEF/REF/KEF).' },

  // ══════════════════════════════════════════════════════════════════════
  // Financial Management (FM) → Enterprise Tech (ET) + Institutional Intel (II)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC100', targetCode: 'FHE-II-011', strength: 'strong', confidence: 75, notes: 'Financial Planning & Budgeting aligns with cost-attribution modelling.' },
  { sourceCode: 'BC104', targetCode: 'FHE-RO-008', strength: 'partial', confidence: 60, notes: 'Price Modelling partially overlaps with research costing & pricing engine.' },
  { sourceCode: 'BC106', targetCode: 'FHE-PC-005', strength: 'exact', confidence: 90, notes: 'Payroll Management maps directly to the payroll & compensation integration layer.' },
  { sourceCode: 'BC109', targetCode: 'FHE-ET-011', strength: 'partial', confidence: 60, notes: 'Asset Management overlaps with IT financial & licence optimisation for software assets.' },
  { sourceCode: 'BC110', targetCode: 'FHE-ET-015', strength: 'strong', confidence: 75, notes: 'Procurement Management aligns with vendor & contract lifecycle oversight.' },
  { sourceCode: 'BC194', targetCode: 'FHE-II-011', strength: 'partial', confidence: 55, notes: 'Project Accounting overlaps with cost-attribution modelling at project level.' },

  // ══════════════════════════════════════════════════════════════════════
  // Human Resource Management (HR) → People & Culture (PC)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC170', targetCode: 'FHE-PC-001', strength: 'exact', confidence: 95, notes: 'Organisational Workforce Planning maps directly to workforce demand modelling.' },
  { sourceCode: 'BC171', targetCode: 'FHE-PC-002', strength: 'exact', confidence: 95, notes: 'Talent Acquisition is a direct match for the talent acquisition & onboarding pipeline.' },
  { sourceCode: 'BC172', targetCode: 'FHE-PC-008', strength: 'strong', confidence: 80, notes: 'Workforce Resource Management aligns with workload allocation & distribution.' },
  { sourceCode: 'BC173', targetCode: 'FHE-PC-009', strength: 'strong', confidence: 80, notes: 'Workforce Relations Management aligns with the employee relations case tracker.' },
  { sourceCode: 'BC174', targetCode: 'FHE-PC-003', strength: 'exact', confidence: 95, notes: 'Workforce Performance Management maps directly to the appraisal & contribution review cycle.' },
  { sourceCode: 'BC175', targetCode: 'FHE-PC-005', strength: 'strong', confidence: 80, notes: 'Remuneration & Benefits Management aligns with the payroll & compensation integration layer.' },
  { sourceCode: 'BC176', targetCode: 'FHE-PC-015', strength: 'strong', confidence: 80, notes: 'Workforce Support Management aligns with the occupational health & wellbeing programme.' },
  { sourceCode: 'BC177', targetCode: 'FHE-PC-007', strength: 'exact', confidence: 95, notes: 'Leave Management is a direct match for absence & leave administration.' },
  { sourceCode: 'BC178', targetCode: 'FHE-PC-014', strength: 'exact', confidence: 95, notes: 'Workforce Separation Management maps directly to the exit & offboarding process.' },
  { sourceCode: 'BC182', targetCode: 'FHE-PC-004', strength: 'exact', confidence: 95, notes: 'Workforce Training & Development maps directly to the professional development & CPD ledger.' },

  // ══════════════════════════════════════════════════════════════════════
  // ICT Management (ICT) → Enterprise Technology (ET)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC120', targetCode: 'FHE-ET-003', strength: 'strong', confidence: 75, notes: 'ICT Strategy & Planning aligns with the service catalogue & request fulfilment.' },
  { sourceCode: 'BC121', targetCode: 'FHE-ET-012', strength: 'strong', confidence: 80, notes: 'Application Management aligns with change & release governance.' },
  { sourceCode: 'BC122', targetCode: 'FHE-ET-004', strength: 'exact', confidence: 95, notes: 'Infrastructure Management maps directly to cloud infrastructure orchestration.' },
  { sourceCode: 'BC123', targetCode: 'FHE-ET-001', strength: 'exact', confidence: 95, notes: 'Identity & Access Management is a direct match for identity federation & single sign-on.' },
  { sourceCode: 'BC124', targetCode: 'FHE-ET-008', strength: 'exact', confidence: 95, notes: 'Information Security Management maps directly to cyber threat detection & response.' },
  { sourceCode: 'BC125', targetCode: 'FHE-ET-013', strength: 'strong', confidence: 85, notes: 'Service Management aligns with observability & service health monitoring.' },
  { sourceCode: 'BC126', targetCode: 'FHE-EN-008', strength: 'strong', confidence: 75, notes: 'Enterprise Content Management aligns with web content & digital-channel governance.' },
  { sourceCode: 'BC127', targetCode: 'FHE-GR-005', strength: 'strong', confidence: 75, notes: 'Records Management aligns with the compliance evidence vault retention scope.' },
  { sourceCode: 'BC128', targetCode: 'FHE-ET-007', strength: 'strong', confidence: 80, notes: 'Digital Workplace Management aligns with endpoint & mobile device governance.' },
  { sourceCode: 'BC129', targetCode: 'FHE-ET-006', strength: 'exact', confidence: 95, notes: 'Data Integration & Interoperability is a direct match for integration hub & event bus.' },
  { sourceCode: 'BC130', targetCode: 'FHE-ET-015', strength: 'exact', confidence: 95, notes: 'ICT Vendor Management maps directly to vendor & contract lifecycle oversight.' },

  // ══════════════════════════════════════════════════════════════════════
  // Engagement & Communication (EC) → Engagement & Communications (EN)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC150', targetCode: 'FHE-EN-010', strength: 'strong', confidence: 85, notes: 'Communications Management aligns with internal communications orchestration.' },
  { sourceCode: 'BC151', targetCode: 'FHE-EN-012', strength: 'strong', confidence: 80, notes: 'Engagement Management aligns with the civic & community engagement register.' },
  { sourceCode: 'BC152', targetCode: 'FHE-EN-002', strength: 'exact', confidence: 95, notes: 'Relationship Management maps directly to the stakeholder relationship ledger.' },
  { sourceCode: 'BC153', targetCode: 'FHE-EN-011', strength: 'strong', confidence: 75, notes: 'Customer Experience Management aligns with the complaint & feedback resolution pathway.' },
  { sourceCode: 'BC154', targetCode: 'FHE-EN-003', strength: 'exact', confidence: 95, notes: 'Event Management is a direct match for event lifecycle coordination.' },
  { sourceCode: 'BC155', targetCode: 'FHE-EN-015', strength: 'strong', confidence: 85, notes: 'Venue Management aligns with the conference & venue hire revenue channel.' },
  { sourceCode: 'BC156', targetCode: 'FHE-EN-006', strength: 'exact', confidence: 95, notes: 'Fundraising & Development maps directly to the philanthropy & donor pipeline.' },
  { sourceCode: 'BC157', targetCode: 'FHE-EN-004', strength: 'exact', confidence: 95, notes: 'Brand Management is a direct match for brand asset & style governance.' },
  { sourceCode: 'BC158', targetCode: 'FHE-EN-013', strength: 'strong', confidence: 75, notes: 'Media Production Management aligns with media relations & press-office workflow.' },
  { sourceCode: 'BC166', targetCode: 'FHE-EN-011', strength: 'exact', confidence: 95, notes: 'Complaint & Compliment Management is a direct match for the complaint & feedback resolution pathway.' },
  { sourceCode: 'BC233', targetCode: 'FHE-EN-006', strength: 'strong', confidence: 85, notes: 'Donor, Sponsor & Philanthropist Management aligns with the philanthropy & donor pipeline.' },

  // ══════════════════════════════════════════════════════════════════════
  // Information Management (IM) → Institutional Intelligence (II)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC160', targetCode: 'FHE-II-006', strength: 'exact', confidence: 95, notes: 'Business Intelligence & Reporting is a direct match for the self-service reporting platform.' },
  { sourceCode: 'BC161', targetCode: 'FHE-II-002', strength: 'exact', confidence: 95, notes: 'Advanced Analytics maps directly to the predictive modelling engine.' },
  { sourceCode: 'BC162', targetCode: 'FHE-II-003', strength: 'exact', confidence: 95, notes: 'Data Management is a direct match for the enterprise data warehouse architecture.' },
  { sourceCode: 'BC163', targetCode: 'FHE-II-009', strength: 'exact', confidence: 95, notes: 'Data Governance maps directly to the data catalogue & lineage registry.' },
  { sourceCode: 'BC164', targetCode: 'FHE-II-007', strength: 'strong', confidence: 85, notes: 'Institutional Research aligns with benchmarking & sector comparison.' },

  // ══════════════════════════════════════════════════════════════════════
  // Legal & Compliance (LC) → Governance Risk & Compliance (GR)
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC190', targetCode: 'FHE-GR-009', strength: 'partial', confidence: 55, notes: 'Legal Advisory overlaps with the committee & governance meeting engine scope.' },
  { sourceCode: 'BC191', targetCode: 'FHE-ET-015', strength: 'strong', confidence: 80, notes: 'Contract Management aligns with vendor & contract lifecycle oversight.' },
  { sourceCode: 'BC192', targetCode: 'FHE-RO-005', strength: 'partial', confidence: 60, notes: 'Intellectual Property Management overlaps with the commercialisation & spin-out pipeline.' },
  { sourceCode: 'BC193', targetCode: 'FHE-GR-002', strength: 'exact', confidence: 95, notes: 'Regulatory Affairs Management is a direct match for the regulatory change radar.' },
  { sourceCode: 'BC226', targetCode: 'FHE-EN-011', strength: 'strong', confidence: 80, notes: 'Student Grievance Management aligns with the complaint & feedback resolution pathway.' },

  // ══════════════════════════════════════════════════════════════════════
  // Facilities & Estate (FE) — limited coverage, mostly weak mappings
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC136', targetCode: 'FHE-GR-005', strength: 'partial', confidence: 55, notes: 'Information Governance partially overlaps with the compliance evidence vault.' },
  { sourceCode: 'BC137', targetCode: 'FHE-SL-003', strength: 'weak', confidence: 40, notes: 'Campus Housing & Accommodation Management only tangentially relates to onboarding flows.' },
  { sourceCode: 'BC139', targetCode: 'FHE-ET-008', strength: 'weak', confidence: 40, notes: 'Campus Security Management only tangentially relates to cyber threat response.' },
  { sourceCode: 'BC142', targetCode: 'FHE-PC-015', strength: 'partial', confidence: 55, notes: 'Health, Safety & Wellbeing Management overlaps with the occupational health programme.' },

  // ══════════════════════════════════════════════════════════════════════
  // Supporting Services (SS) — limited coverage
  // ══════════════════════════════════════════════════════════════════════

  { sourceCode: 'BC200', targetCode: 'FHE-ET-012', strength: 'partial', confidence: 55, notes: 'Project Management partially overlaps with change & release governance scope.' },
  { sourceCode: 'BC201', targetCode: 'FHE-ET-012', strength: 'weak', confidence: 40, notes: 'Programme Management only tangentially relates to change governance.' },
  { sourceCode: 'BC202', targetCode: 'FHE-ET-003', strength: 'weak', confidence: 40, notes: 'Business Process Management shares only service catalogue framing.' },
  { sourceCode: 'BC203', targetCode: 'FHE-ET-012', strength: 'strong', confidence: 75, notes: 'Change Management aligns with change & release governance.' },
  { sourceCode: 'BC214', targetCode: 'FHE-II-009', strength: 'weak', confidence: 45, notes: 'Digital Preservation Management shares limited scope with data catalogue & lineage.' },
  { sourceCode: 'BC216', targetCode: 'FHE-GR-011', strength: 'exact', confidence: 90, notes: 'Insurance Management maps directly to the insurance & indemnity register.' },
  { sourceCode: 'BC217', targetCode: 'FHE-ET-013', strength: 'strong', confidence: 80, notes: 'Service Level Management aligns with observability & service health monitoring.' },
];
