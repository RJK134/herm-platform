// server/src/data/fhe-framework.ts
// FHE Capability Framework v1.0
// Proprietary taxonomy for institutional technology assessment and procurement readiness.
// Copyright Future Horizons Education. All rights reserved.
//
// LEGAL NOTE: This framework is an original work. It uses a distinct domain structure,
// naming convention, and coding scheme (FHE-XX-NNN) with zero textual overlap
// with any third-party capability model.

export interface FheCapability {
  code: string;        // FHE-XX-NNN format
  name: string;
  description: string;
  sortOrder: number;
}

export interface FheDomain {
  code: string;        // Two-letter domain code
  name: string;
  description: string;
  colour: string;      // Hex colour for UI rendering
  sortOrder: number;
  capabilities: FheCapability[];
}

export interface FheFrameworkDefinition {
  slug: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  domains: FheDomain[];
}

export const FHE_FRAMEWORK: FheFrameworkDefinition = {
  slug: 'fhe-capability-framework',
  name: 'FHE Capability Framework',
  version: '1.0',
  publisher: 'Future Horizons Education',
  description: 'Proprietary capability taxonomy for institutional technology assessment, procurement readiness, and maturity evaluation across eight operational domains.',
  domains: [
    // ── 1. Digital Learning Infrastructure (DL) ─────────────────────────────
    {
      code: 'DL',
      name: 'Digital Learning Infrastructure',
      description: 'Technology platforms and tooling that underpin the design, delivery, and evaluation of taught provision across all modes of study.',
      colour: '#2563EB',
      sortOrder: 1,
      capabilities: [
        { code: 'FHE-DL-001', name: 'Virtual Learning Environment Provisioning', description: 'Configuration, deployment, and lifecycle governance of the institutional VLE/LMS instance including tenant isolation, plugin management, and release orchestration.', sortOrder: 1 },
        { code: 'FHE-DL-002', name: 'Digital Content Authoring Pipeline', description: 'Toolchain for creating, versioning, and publishing reusable learning objects compliant with xAPI, SCORM, and Common Cartridge standards.', sortOrder: 2 },
        { code: 'FHE-DL-003', name: 'Learner Analytics Instrumentation', description: 'Collection, normalisation, and dashboarding of learner interaction telemetry for early-warning triggers and engagement profiling.', sortOrder: 3 },
        { code: 'FHE-DL-004', name: 'Assessment Engine Orchestration', description: 'Scheduling, delivery, and secure submission handling for formative and summative assessment artefacts across online and invigilated channels.', sortOrder: 4 },
        { code: 'FHE-DL-005', name: 'Academic Integrity Tooling', description: 'Plagiarism detection, contract-cheating deterrence, AI-generated-content screening, and originality report lifecycle management.', sortOrder: 5 },
        { code: 'FHE-DL-006', name: 'Adaptive Pathway Configuration', description: 'Rule-based or ML-driven personalisation of learning sequences, prerequisite gating, and remediation routing within module delivery.', sortOrder: 6 },
        { code: 'FHE-DL-007', name: 'Micro-credential Issuance Platform', description: 'Design, assessment, badge minting, and portable credential wallet integration for stackable short-course awards.', sortOrder: 7 },
        { code: 'FHE-DL-008', name: 'Lecture Capture & Media Distribution', description: 'Automated recording, transcoding, captioning, and on-demand streaming of synchronous teaching sessions.', sortOrder: 8 },
        { code: 'FHE-DL-009', name: 'Remote Proctoring Fabric', description: 'Identity verification, browser-lockdown, and AI-assisted invigilation for remotely-sat examinations.', sortOrder: 9 },
        { code: 'FHE-DL-010', name: 'Collaborative Workspace Enablement', description: 'Provisioning of shared digital workspaces (wikis, whiteboards, group repositories) aligned to cohort and module structures.', sortOrder: 10 },
        { code: 'FHE-DL-011', name: 'Accessibility Compliance Engine', description: 'Automated scanning and remediation workflows ensuring all digital learning materials meet WCAG 2.2 AA and institutional inclusivity standards.', sortOrder: 11 },
        { code: 'FHE-DL-012', name: 'LTI & EdTech Connector Hub', description: 'Standards-based integration broker managing LTI 1.3 Advantage, xAPI, and proprietary plugin connections to the learning technology ecosystem.', sortOrder: 12 },
        { code: 'FHE-DL-013', name: 'Simulation & Virtual Lab Hosting', description: 'Provisioning and scheduling of cloud-hosted simulation environments, virtual desktop labs, and discipline-specific software sandboxes.', sortOrder: 13 },
        { code: 'FHE-DL-014', name: 'Competency Mapping & Skills Tagging', description: 'Mapping of learning outcomes and assessment criteria to external competency frameworks, occupational standards, and employer skill taxonomies.', sortOrder: 14 },
        { code: 'FHE-DL-015', name: 'E-Portfolio & Evidence Collection', description: 'Learner-owned digital portfolio platform for aggregating, reflecting on, and showcasing assessed and experiential evidence.', sortOrder: 15 },
      ],
    },

    // ── 2. Student Lifecycle Operations (SL) ────────────────────────────────
    {
      code: 'SL',
      name: 'Student Lifecycle Operations',
      description: 'End-to-end operational processes governing the journey from initial enquiry through award conferral and post-completion tracking.',
      colour: '#16A34A',
      sortOrder: 2,
      capabilities: [
        { code: 'FHE-SL-001', name: 'Prospect Pipeline Orchestration', description: 'Capture, scoring, nurturing, and conversion tracking of prospective applicants across recruitment channels and campaigns.', sortOrder: 1 },
        { code: 'FHE-SL-002', name: 'Offer Processing & Condition Tracking', description: 'Generation, dispatch, and fulfilment monitoring of conditional and unconditional offers including clearing and adjustment workflows.', sortOrder: 2 },
        { code: 'FHE-SL-003', name: 'Onboarding Workflow Automation', description: 'Orchestration of pre-arrival tasks including identity verification, visa checks, fee deposits, accommodation allocation, and IT account provisioning.', sortOrder: 3 },
        { code: 'FHE-SL-004', name: 'Registration & Enrolment Engine', description: 'Self-service and staff-assisted registration flows covering programme selection, module choice, fee classification, and statutory data collection.', sortOrder: 4 },
        { code: 'FHE-SL-005', name: 'Progress Monitoring Framework', description: 'Rules-driven tracking of academic standing, credit accumulation, progression triggers, and at-risk identification across taught and research programmes.', sortOrder: 5 },
        { code: 'FHE-SL-006', name: 'Interruption & Withdrawal Processing', description: 'Case management for temporary suspensions, permanent withdrawals, refund triggers, and statutory reporting adjustments.', sortOrder: 6 },
        { code: 'FHE-SL-007', name: 'Award Conferral Processing', description: 'Classification calculation, senate-approval workflow, certificate generation, and transcript issuance for graduating cohorts.', sortOrder: 7 },
        { code: 'FHE-SL-008', name: 'Post-completion Engagement Tracking', description: 'Graduate destination surveys, alumni relationship seeding, and longitudinal outcome monitoring for regulatory and reputational metrics.', sortOrder: 8 },
        { code: 'FHE-SL-009', name: 'Attendance & Engagement Capture', description: 'Multi-source attendance recording (physical tap, VLE login, submission activity) with aggregation for welfare and visa compliance thresholds.', sortOrder: 9 },
        { code: 'FHE-SL-010', name: 'Placement & Work-Based Learning Coordination', description: 'Matching, safeguarding checks, employer agreements, visit scheduling, and assessment integration for sandwich years and clinical placements.', sortOrder: 10 },
        { code: 'FHE-SL-011', name: 'International Mobility Administration', description: 'Outbound exchange agreements, Turing Scheme applications, credit-transfer mapping, and reintegration workflows for study-abroad participants.', sortOrder: 11 },
        { code: 'FHE-SL-012', name: 'Reassessment & Repeat Scheduling', description: 'Identification of eligible candidates, resit timetabling, mark-capping rules enforcement, and board-recommendation actioning.', sortOrder: 12 },
        { code: 'FHE-SL-013', name: 'Sponsorship & Fee-Payer Liaison', description: 'Sponsor agreement registration, split-billing configuration, purchase-order matching, and payment-status visibility for third-party funders.', sortOrder: 13 },
        { code: 'FHE-SL-014', name: 'Prior Experiential Learning Evaluation', description: 'Portfolio-based credit claims, panel assessment workflows, and credit-award recording for non-traditional entry qualifications.', sortOrder: 14 },
        { code: 'FHE-SL-015', name: 'Timetable Slot Allocation Engine', description: 'Constraint-satisfaction scheduling of teaching events against rooms, staff availability, cohort clashes, and accessibility requirements.', sortOrder: 15 },
        { code: 'FHE-SL-016', name: 'Student Welfare Case Coordination', description: 'Referral triage, case notes, multi-service handoffs, and outcome recording for wellbeing, disability, and safeguarding interventions.', sortOrder: 16 },
      ],
    },

    // ── 3. Institutional Intelligence (II) ──────────────────────────────────
    {
      code: 'II',
      name: 'Institutional Intelligence',
      description: 'Data architecture, analytics, and reporting capabilities that convert operational data into actionable institutional insight.',
      colour: '#9333EA',
      sortOrder: 3,
      capabilities: [
        { code: 'FHE-II-001', name: 'Operational Dashboard Framework', description: 'Real-time KPI dashboards for senior leadership covering enrolment, retention, finance, and research activity with drill-down navigation.', sortOrder: 1 },
        { code: 'FHE-II-002', name: 'Predictive Modelling Engine', description: 'Statistical and ML models for forecasting enrolment yield, student attrition, financial projections, and workforce demand.', sortOrder: 2 },
        { code: 'FHE-II-003', name: 'Enterprise Data Warehouse Architecture', description: 'Centralised, governed data store integrating feeds from SIS, finance, HR, research, and estates for cross-domain analysis.', sortOrder: 3 },
        { code: 'FHE-II-004', name: 'Statutory Return Pipeline', description: 'Automated extraction, transformation, validation, and submission-ready packaging of data for regulators (e.g. HESA Data Futures, OfS).', sortOrder: 4 },
        { code: 'FHE-II-005', name: 'Data Quality Assurance Framework', description: 'Profiling, rule-based validation, anomaly detection, and stewardship workflows that maintain data fitness for purpose.', sortOrder: 5 },
        { code: 'FHE-II-006', name: 'Self-service Reporting Platform', description: 'Role-based access to curated datasets, drag-and-drop report building, and scheduled distribution for departmental analysts.', sortOrder: 6 },
        { code: 'FHE-II-007', name: 'Benchmarking & Sector Comparison', description: 'Ingestion of sector-level datasets (HEIDI+, league tables) and internal metrics alignment for competitive positioning analysis.', sortOrder: 7 },
        { code: 'FHE-II-008', name: 'Survey & Feedback Aggregation', description: 'Centralised collection, sentiment analysis, and longitudinal trending of NSS, PTES, module evaluations, and ad-hoc pulse surveys.', sortOrder: 8 },
        { code: 'FHE-II-009', name: 'Data Catalogue & Lineage Registry', description: 'Searchable inventory of institutional datasets with column-level definitions, ownership, classification, and upstream-downstream lineage.', sortOrder: 9 },
        { code: 'FHE-II-010', name: 'Regulatory Metric Computation', description: 'Automated calculation of TEF, REF, KEF, continuation, completion, and progression metrics using published OfS methodology.', sortOrder: 10 },
        { code: 'FHE-II-011', name: 'Cost-attribution Modelling', description: 'Activity-based and resource-consumption costing models at programme, module, and department level for pricing and planning.', sortOrder: 11 },
        { code: 'FHE-II-012', name: 'Geospatial & Demographic Analytics', description: 'Mapping of student domicile, widening-participation indicators, and catchment-area analysis for targeted recruitment strategy.', sortOrder: 12 },
        { code: 'FHE-II-013', name: 'Data Ethics Review Process', description: 'Governance workflow for evaluating analytical use-cases against fairness, bias, and privacy criteria before deployment to production.', sortOrder: 13 },
      ],
    },

    // ── 4. Research Operations (RO) ─────────────────────────────────────────
    {
      code: 'RO',
      name: 'Research Operations',
      description: 'Systems and processes supporting the full research lifecycle from funding pursuit through output dissemination and societal impact evidencing.',
      colour: '#DC2626',
      sortOrder: 4,
      capabilities: [
        { code: 'FHE-RO-001', name: 'Grant Lifecycle Orchestration', description: 'End-to-end tracking of funding bids from opportunity identification, costing, internal approval, submission, and post-award management.', sortOrder: 1 },
        { code: 'FHE-RO-002', name: 'Ethics Approval Workflow', description: 'Application routing, committee scheduling, conditional-approval tracking, and annual-review reminders for research involving human participants or animals.', sortOrder: 2 },
        { code: 'FHE-RO-003', name: 'Institutional Repository & Discovery', description: 'Deposit, metadata enrichment, embargo management, and public discovery of research outputs compliant with REF open-access policy.', sortOrder: 3 },
        { code: 'FHE-RO-004', name: 'Societal Impact Evidence Collation', description: 'Structured capture of impact narratives, corroborating evidence, beneficiary testimonials, and case-study assembly for REF submissions.', sortOrder: 4 },
        { code: 'FHE-RO-005', name: 'Commercialisation & Spin-out Pipeline', description: 'Invention disclosure, patent prosecution tracking, licensing negotiation, and equity-stake governance for technology-transfer activities.', sortOrder: 5 },
        { code: 'FHE-RO-006', name: 'Research Data Stewardship', description: 'Data management plan creation, FAIR-principles compliance checking, repository deposit, and long-term preservation for funder mandates.', sortOrder: 6 },
        { code: 'FHE-RO-007', name: 'Doctoral Candidature Administration', description: 'Milestone tracking, supervisor allocation, annual progression review, thesis submission, and viva-voce examination scheduling.', sortOrder: 7 },
        { code: 'FHE-RO-008', name: 'Research Costing & Pricing Engine', description: 'Full economic costing (fEC) calculations, funder-rate card application, and institutional-contribution modelling for grant budgets.', sortOrder: 8 },
        { code: 'FHE-RO-009', name: 'Collaboration Agreement Broker', description: 'Template generation, IP-sharing clause negotiation, and execution tracking for multi-institutional and industry research partnerships.', sortOrder: 9 },
        { code: 'FHE-RO-010', name: 'Bibliometric & Citation Tracking', description: 'Harvesting of publication metadata, h-index computation, journal-ranking alignment, and departmental research-profile dashboarding.', sortOrder: 10 },
        { code: 'FHE-RO-011', name: 'Research Equipment & Facility Booking', description: 'Shared-instrument scheduling, access-charge calculation, maintenance logging, and utilisation reporting for core research facilities.', sortOrder: 11 },
        { code: 'FHE-RO-012', name: 'Open-access Compliance Monitor', description: 'Policy-rule matching, embargo-date alerting, APC payment tracking, and green/gold route classification for published outputs.', sortOrder: 12 },
        { code: 'FHE-RO-013', name: 'Research Integrity Assurance', description: 'Declaration-of-interest collection, misconduct allegation case management, and remediation tracking aligned to the Concordat to Support Research Integrity.', sortOrder: 13 },
        { code: 'FHE-RO-014', name: 'Knowledge Exchange & Consultancy Ledger', description: 'Logging of consultancy contracts, CPD delivery, KTP partnerships, and KEF-narrative assembly for income and impact reporting.', sortOrder: 14 },
        { code: 'FHE-RO-015', name: 'Research Performance Scorecard', description: 'Aggregated view of publications, citations, grant income, doctoral completions, and impact indicators at individual, group, and department level.', sortOrder: 15 },
      ],
    },

    // ── 5. Governance Risk & Compliance (GR) ────────────────────────────────
    {
      code: 'GR',
      name: 'Governance Risk & Compliance',
      description: 'Institutional assurance capabilities spanning policy governance, risk appetite, regulatory adherence, and audit readiness.',
      colour: '#EA580C',
      sortOrder: 5,
      capabilities: [
        { code: 'FHE-GR-001', name: 'Policy Lifecycle Stewardship', description: 'Drafting, consultation, approval routing, version control, publication, and scheduled review of institutional policies and regulations.', sortOrder: 1 },
        { code: 'FHE-GR-002', name: 'Regulatory Change Radar', description: 'Horizon-scanning service that ingests legislative and regulatory updates (OfS, UKVI, ICO, EHRC) and maps them to affected institutional processes.', sortOrder: 2 },
        { code: 'FHE-GR-003', name: 'Internal Audit Scheduling & Tracking', description: 'Risk-based audit planning, fieldwork scheduling, finding lifecycle management, and management-response follow-up automation.', sortOrder: 3 },
        { code: 'FHE-GR-004', name: 'Enterprise Risk Register', description: 'Hierarchical risk catalogue with likelihood-impact scoring, control mapping, risk-owner assignment, and board-reporting roll-ups.', sortOrder: 4 },
        { code: 'FHE-GR-005', name: 'Compliance Evidence Vault', description: 'Centralised document store linking regulatory obligations to evidence artefacts with expiry alerting and completeness dashboarding.', sortOrder: 5 },
        { code: 'FHE-GR-006', name: 'Data Protection Impact Orchestration', description: 'Workflow for conducting, reviewing, and registering DPIAs for new processing activities as required by UK GDPR Article 35.', sortOrder: 6 },
        { code: 'FHE-GR-007', name: 'Freedom of Information Request Handler', description: 'Logging, routing, redaction workflow, response drafting, and statutory-deadline tracking for FOI and SAR requests.', sortOrder: 7 },
        { code: 'FHE-GR-008', name: 'Incident & Breach Response Coordinator', description: 'Classification, containment, root-cause analysis, ICO notification assessment, and remediation tracking for data breaches and security incidents.', sortOrder: 8 },
        { code: 'FHE-GR-009', name: 'Committee & Governance Meeting Engine', description: 'Agenda assembly, paper circulation, minute capture, action tracking, and quorum validation for senate, council, and sub-committees.', sortOrder: 9 },
        { code: 'FHE-GR-010', name: 'Whistleblowing & Disclosure Channel', description: 'Secure, anonymous reporting portal with case-handler assignment, investigation workflow, and outcome recording under the institution\'s public-interest disclosure policy.', sortOrder: 10 },
        { code: 'FHE-GR-011', name: 'Insurance & Indemnity Register', description: 'Policy schedule tracking, renewal alerting, claims logging, and premium benchmarking across institutional insurance portfolios.', sortOrder: 11 },
        { code: 'FHE-GR-012', name: 'Regulatory Return Compliance Tracker', description: 'Checklist-driven monitoring of submission deadlines, data-quality gates, and sign-off chains for OfS, HESA, UKRI, and charity returns.', sortOrder: 12 },
        { code: 'FHE-GR-013', name: 'Modern Slavery & Due-Diligence Screening', description: 'Supplier and partner screening against sanctions lists, modern-slavery risk assessment, and annual-statement publication workflow.', sortOrder: 13 },
        { code: 'FHE-GR-014', name: 'Equality Impact Assessment Workflow', description: 'Structured assessment of policies, practices, and decisions against the Public Sector Equality Duty with action-plan generation.', sortOrder: 14 },
      ],
    },

    // ── 6. Enterprise Technology (ET) ───────────────────────────────────────
    {
      code: 'ET',
      name: 'Enterprise Technology',
      description: 'Core technology infrastructure, integration architecture, and operational services that underpin all institutional digital capabilities.',
      colour: '#0891B2',
      sortOrder: 6,
      capabilities: [
        { code: 'FHE-ET-001', name: 'Identity Federation & Single Sign-On', description: 'SAML 2.0 / OIDC identity provider configuration, UK Access Management Federation membership, and MFA policy enforcement across institutional services.', sortOrder: 1 },
        { code: 'FHE-ET-002', name: 'API Gateway & Rate Governance', description: 'Centralised API ingress with authentication, throttling, versioning, and developer-portal documentation for internal and partner consumers.', sortOrder: 2 },
        { code: 'FHE-ET-003', name: 'Service Catalogue & Request Fulfilment', description: 'User-facing catalogue of IT services with self-service request forms, SLA tracking, and automated provisioning where applicable.', sortOrder: 3 },
        { code: 'FHE-ET-004', name: 'Cloud Infrastructure Orchestration', description: 'IaC-managed provisioning, scaling, and cost-governance of compute, storage, and networking across public cloud and on-premise hybrid estates.', sortOrder: 4 },
        { code: 'FHE-ET-005', name: 'Disaster Recovery & Business Continuity', description: 'RPO/RTO-defined backup strategies, failover testing schedules, and documented recovery runbooks for critical institutional systems.', sortOrder: 5 },
        { code: 'FHE-ET-006', name: 'Integration Hub & Event Bus', description: 'Message-broker architecture (e.g. Kafka, RabbitMQ) for asynchronous event propagation, canonical data model enforcement, and dead-letter handling.', sortOrder: 6 },
        { code: 'FHE-ET-007', name: 'Endpoint & Mobile Device Governance', description: 'MDM/UEM policy enforcement, OS patching compliance, and BYOD posture assessment for staff and student-owned devices accessing institutional resources.', sortOrder: 7 },
        { code: 'FHE-ET-008', name: 'Cyber Threat Detection & Response', description: 'SIEM/SOAR deployment, vulnerability scanning cadence, penetration-test remediation tracking, and Jisc Janet CSIRT coordination.', sortOrder: 8 },
        { code: 'FHE-ET-009', name: 'Digital Certificate & Secret Rotation', description: 'Automated TLS certificate renewal, API-key rotation scheduling, and secrets-vault management for service-to-service credentials.', sortOrder: 9 },
        { code: 'FHE-ET-010', name: 'Network & Campus Connectivity Fabric', description: 'Wired and wireless network design, Janet connectivity, eduroam configuration, and bandwidth-capacity planning for teaching and research traffic.', sortOrder: 10 },
        { code: 'FHE-ET-011', name: 'IT Financial & Licence Optimisation', description: 'Software-asset inventory, licence-entitlement reconciliation, cloud-spend analysis, and renewal-calendar management to reduce waste.', sortOrder: 11 },
        { code: 'FHE-ET-012', name: 'Change & Release Governance', description: 'CAB scheduling, change-risk classification, deployment-window management, and post-implementation review for production changes.', sortOrder: 12 },
        { code: 'FHE-ET-013', name: 'Observability & Service Health Monitoring', description: 'Centralised logging, distributed tracing, uptime dashboards, and alerting rules for SLA-critical institutional applications.', sortOrder: 13 },
        { code: 'FHE-ET-014', name: 'Data Sovereignty & Residency Control', description: 'Policy enforcement ensuring regulated data categories (student PII, research data) remain within approved geographic jurisdictions.', sortOrder: 14 },
        { code: 'FHE-ET-015', name: 'Vendor & Contract Lifecycle Oversight', description: 'Technology-vendor performance reviews, SLA monitoring, contract-renewal pipeline, and exit-strategy planning for critical suppliers.', sortOrder: 15 },
      ],
    },

    // ── 7. People & Culture (PC) ────────────────────────────────────────────
    {
      code: 'PC',
      name: 'People & Culture',
      description: 'Workforce management capabilities covering the employee lifecycle, organisational development, and institutional culture programmes.',
      colour: '#CA8A04',
      sortOrder: 7,
      capabilities: [
        { code: 'FHE-PC-001', name: 'Workforce Demand Modelling', description: 'Scenario-based headcount planning using student-number forecasts, workload norms, and strategic-initiative staffing requirements.', sortOrder: 1 },
        { code: 'FHE-PC-002', name: 'Talent Acquisition & Onboarding Pipeline', description: 'Vacancy authorisation, job-board syndication, applicant tracking, interview scheduling, offer management, and new-starter induction workflow.', sortOrder: 2 },
        { code: 'FHE-PC-003', name: 'Appraisal & Contribution Review Cycle', description: 'Annual and probationary review scheduling, objective setting, self-assessment collection, reviewer calibration, and outcome recording.', sortOrder: 3 },
        { code: 'FHE-PC-004', name: 'Professional Development & CPD Ledger', description: 'Training-needs analysis, course booking, external-qualification tracking, and Advance HE fellowship evidence portfolios.', sortOrder: 4 },
        { code: 'FHE-PC-005', name: 'Payroll & Compensation Integration Layer', description: 'Interfacing with payroll processors for salary calculations, pension contributions, tax deductions, and ad-hoc payment instructions.', sortOrder: 5 },
        { code: 'FHE-PC-006', name: 'Succession & Critical-Role Planning', description: 'Identification of key-person dependencies, readiness assessment of internal candidates, and development-pathway assignment for leadership pipeline.', sortOrder: 6 },
        { code: 'FHE-PC-007', name: 'Absence & Leave Administration', description: 'Holiday entitlement calculation, sickness-absence recording, occupational-health referral triggers, and return-to-work workflows.', sortOrder: 7 },
        { code: 'FHE-PC-008', name: 'Workload Allocation & Distribution', description: 'Academic workload model configuration (teaching, research, admin, citizenship) with transparency dashboards and equity monitoring.', sortOrder: 8 },
        { code: 'FHE-PC-009', name: 'Employee Relations Case Tracker', description: 'Formal grievance, disciplinary, and capability case management with timeline tracking, evidence bundles, and outcome logging.', sortOrder: 9 },
        { code: 'FHE-PC-010', name: 'Staff Induction & Probation Workflow', description: 'Structured onboarding checklist delivery, mandatory-training completion tracking, and probation-milestone sign-off automation.', sortOrder: 10 },
        { code: 'FHE-PC-011', name: 'Diversity, Equity & Inclusion Dashboard', description: 'Workforce demographic profiling, pay-gap analysis, Athena SWAN action-plan monitoring, and protected-characteristic trend reporting.', sortOrder: 11 },
        { code: 'FHE-PC-012', name: 'Casual & Fixed-Term Contract Administration', description: 'Hourly-paid claims processing, contract-renewal alerting, continuous-service monitoring, and conversion-to-permanent eligibility flagging.', sortOrder: 12 },
        { code: 'FHE-PC-013', name: 'Right-to-Work & DBS Verification', description: 'Document scanning, expiry alerting, enhanced-DBS application tracking, and Home Office employer-checking service integration.', sortOrder: 13 },
        { code: 'FHE-PC-014', name: 'Exit & Offboarding Process', description: 'Resignation acceptance, notice-period tracking, exit-interview scheduling, IT-account deprovisioning, and knowledge-transfer handover facilitation.', sortOrder: 14 },
        { code: 'FHE-PC-015', name: 'Occupational Health & Wellbeing Programme', description: 'Employee assistance programme referrals, workplace-adjustment requests, stress risk-assessment logging, and wellbeing-initiative tracking.', sortOrder: 15 },
      ],
    },

    // ── 8. Engagement & Communications (EN) ─────────────────────────────────
    {
      code: 'EN',
      name: 'Engagement & Communications',
      description: 'External relations, marketing communications, stakeholder cultivation, and revenue-generating engagement activities.',
      colour: '#DB2777',
      sortOrder: 8,
      capabilities: [
        { code: 'FHE-EN-001', name: 'Multi-channel Campaign Orchestration', description: 'Planning, scheduling, A/B testing, and performance analysis of email, social, paid-search, and direct-mail recruitment and awareness campaigns.', sortOrder: 1 },
        { code: 'FHE-EN-002', name: 'Stakeholder Relationship Ledger', description: 'CRM-style contact management for alumni, employers, civic partners, and government stakeholders with interaction history and engagement scoring.', sortOrder: 2 },
        { code: 'FHE-EN-003', name: 'Event Lifecycle Coordination', description: 'Open-day, graduation-ceremony, conference, and public-lecture planning including registration, venue booking, catering, and post-event evaluation.', sortOrder: 3 },
        { code: 'FHE-EN-004', name: 'Brand Asset & Style Governance', description: 'Central repository of logos, templates, tone-of-voice guidelines, and brand-compliance review workflows for publications and digital channels.', sortOrder: 4 },
        { code: 'FHE-EN-005', name: 'Sentiment & Reputation Monitoring', description: 'Social-listening dashboards, press-mention aggregation, league-table tracking, and reputational-risk early-warning alerts.', sortOrder: 5 },
        { code: 'FHE-EN-006', name: 'Philanthropy & Donor Pipeline', description: 'Major-gift prospect research, cultivation planning, pledge management, gift-acceptance governance, and stewardship reporting.', sortOrder: 6 },
        { code: 'FHE-EN-007', name: 'Corporate Partnership Brokerage', description: 'Pipeline management for employer partnerships including apprenticeship-levy claims, co-funded research, and graduate-recruitment agreements.', sortOrder: 7 },
        { code: 'FHE-EN-008', name: 'Web Content & Digital-Channel Governance', description: 'CMS workflow for page authoring, approval chains, SEO optimisation, link-rot detection, and multi-site architecture management.', sortOrder: 8 },
        { code: 'FHE-EN-009', name: 'Prospectus & Publication Production', description: 'Print and digital prospectus lifecycle from content commissioning, design production, proofing, and distribution tracking.', sortOrder: 9 },
        { code: 'FHE-EN-010', name: 'Internal Communications Orchestration', description: 'Staff newsletter scheduling, all-staff announcement management, intranet content curation, and readership analytics.', sortOrder: 10 },
        { code: 'FHE-EN-011', name: 'Complaint & Feedback Resolution Pathway', description: 'Formal complaint intake, stage-escalation routing (departmental, institutional, OIA referral), and resolution-outcome recording.', sortOrder: 11 },
        { code: 'FHE-EN-012', name: 'Civic & Community Engagement Register', description: 'Logging of public-engagement activities, schools-outreach programmes, widening-participation interventions, and Knowledge Exchange Framework narratives.', sortOrder: 12 },
        { code: 'FHE-EN-013', name: 'Media Relations & Press-Office Workflow', description: 'Press-release drafting, journalist-contact database, embargo management, and crisis-communications playbook activation.', sortOrder: 13 },
        { code: 'FHE-EN-014', name: 'Merchandise & Licensing Administration', description: 'Branded-merchandise catalogue management, licensing-agreement tracking, and royalty-income reconciliation.', sortOrder: 14 },
        { code: 'FHE-EN-015', name: 'Conference & Venue Hire Revenue Channel', description: 'External-event enquiry handling, room-hire pricing, AV equipment booking, catering coordination, and income attribution.', sortOrder: 15 },
      ],
    },
  ],
};
