import prisma from '../../utils/prisma';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StageDefinition {
  stageCode: string;
  stageName: string;
  stageOrder: number;
  description: string;
  minimumDays: number;
  isMandatory: boolean;
  tasks: TaskDefinition[];
  requiredApprovals: ApprovalDefinition[];
  complianceCheckCodes: string[];
}

export interface TaskDefinition {
  title: string;
  description: string;
  isMandatory: boolean;
  sortOrder: number;
}

export interface ApprovalDefinition {
  approverRole: string;
  description: string;
}

export interface TimelineEntry {
  stageCode: string;
  stageName: string;
  startDate: Date;
  endDate: Date;
  minimumDays: number;
  isStatutory: boolean;
  keyDeadlines: Array<{ label: string; date: Date }>;
}

export interface ComplianceResult {
  passed: boolean;
  failures: Array<{
    check: string;
    requirement: string;
    status: string;
    remediation: string;
  }>;
}

// ── Jurisdiction stage definitions ────────────────────────────────────────────

const UK_STAGES: StageDefinition[] = [
  {
    stageCode: 'PLANNING',
    stageName: 'Planning & Business Case',
    stageOrder: 1,
    description: 'Define requirements, obtain budget approval, establish project governance',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Complete business case (HM Treasury 5 Case Model)', description: 'Strategic, economic, commercial, financial, management cases', isMandatory: true, sortOrder: 1 },
      { title: 'Obtain budget approval from Finance Director', description: 'Written approval with budget code', isMandatory: true, sortOrder: 2 },
      { title: 'Establish procurement governance (SRO, project team)', description: 'Appoint Senior Responsible Owner and project team', isMandatory: true, sortOrder: 3 },
      { title: 'Conduct data protection impact assessment (DPIA)', description: 'Required for processing personal data — UK GDPR', isMandatory: true, sortOrder: 4 },
      { title: 'Register contract in contracts register', description: 'Required under Procurement Act 2023 transparency rules', isMandatory: false, sortOrder: 5 },
      { title: 'Confirm estimated value and procurement route', description: 'Threshold check determines applicable procedure', isMandatory: true, sortOrder: 6 },
    ],
    requiredApprovals: [
      { approverRole: 'FINANCE_DIRECTOR', description: 'Budget and business case sign-off' },
      { approverRole: 'SRO', description: 'Senior Responsible Owner appointment' },
    ],
    complianceCheckCodes: ['THRESHOLD_CHECK', 'BUDGET_APPROVED'],
  },
  {
    stageCode: 'MARKET_ANALYSIS',
    stageName: 'Market Engagement',
    stageOrder: 2,
    description: 'Engage the market, publish Pipeline Notice if required, gather intelligence',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Conduct market analysis (existing solutions landscape)', description: 'Research existing systems, HERM capability mapping', isMandatory: true, sortOrder: 1 },
      { title: 'Issue Request for Information (RFI) to market', description: 'Optional but recommended for complex procurements', isMandatory: false, sortOrder: 2 },
      { title: 'Publish Pipeline Notice on Find a Tender (if applicable)', description: 'Required for contracts >£2m under Procurement Act 2023', isMandatory: false, sortOrder: 3 },
      { title: 'Hold supplier engagement days / demos', description: 'Pre-market consultation to inform specification', isMandatory: false, sortOrder: 4 },
      { title: 'Document market engagement outcomes', description: 'Record all market engagement to demonstrate fair competition', isMandatory: true, sortOrder: 5 },
      { title: 'Confirm procurement route (open / competitive flexible / limited)', description: 'Select procedure based on complexity and market', isMandatory: true, sortOrder: 6 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['MARKET_ENGAGEMENT_DOCUMENTED'],
  },
  {
    stageCode: 'SPECIFICATION',
    stageName: 'Requirements Specification',
    stageOrder: 3,
    description: 'Finalise technical and functional requirements, prepare ITT documentation',
    minimumDays: 21,
    isMandatory: true,
    tasks: [
      { title: 'Develop functional requirements specification', description: 'HERM-aligned capability requirements from basket', isMandatory: true, sortOrder: 1 },
      { title: 'Develop technical requirements (integration, security, hosting)', description: 'Include GDPR, Cyber Essentials Plus, accessibility requirements', isMandatory: true, sortOrder: 2 },
      { title: 'Define evaluation criteria and weightings', description: 'MEAT criteria — document the weighting methodology', isMandatory: true, sortOrder: 3 },
      { title: 'Draft ITT/RFP document', description: 'Full tender documentation including terms and conditions', isMandatory: true, sortOrder: 4 },
      { title: 'Legal review of contract terms', description: 'Legal sign-off on terms and conditions, IP provisions', isMandatory: true, sortOrder: 5 },
      { title: 'Equality Impact Assessment', description: 'Required under public sector equality duty', isMandatory: false, sortOrder: 6 },
      { title: 'Procurement team review and sign-off', description: 'Internal procurement governance sign-off', isMandatory: true, sortOrder: 7 },
    ],
    requiredApprovals: [
      { approverRole: 'PROCUREMENT_LEAD', description: 'ITT documents sign-off' },
      { approverRole: 'LEGAL', description: 'Contract terms legal review' },
    ],
    complianceCheckCodes: ['SPEC_APPROVED', 'EVALUATION_CRITERIA_DEFINED'],
  },
  {
    stageCode: 'NOTICE',
    stageName: 'Tender Notice Publication',
    stageOrder: 4,
    description: 'Publish tender notice on Find a Tender; minimum 30-day tender period',
    minimumDays: 30,
    isMandatory: true,
    tasks: [
      { title: 'Publish Tender Notice on Find a Tender Service', description: 'Required under Procurement Act 2023 — use FTS portal', isMandatory: true, sortOrder: 1 },
      { title: 'Make ITT documents available via eTendering platform', description: 'Proactively publish all tender documents', isMandatory: true, sortOrder: 2 },
      { title: 'Handle clarification questions from bidders', description: 'Publish all Q&As to all bidders simultaneously', isMandatory: true, sortOrder: 3 },
      { title: 'Record tender reference number', description: 'Find a Tender reference for audit trail', isMandatory: true, sortOrder: 4 },
      { title: 'Monitor submissions and deadline', description: 'Confirm electronic submission deadline compliance', isMandatory: true, sortOrder: 5 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['NOTICE_PUBLISHED', 'MINIMUM_TENDER_PERIOD'],
  },
  {
    stageCode: 'EVALUATION',
    stageName: 'Tender Evaluation',
    stageOrder: 5,
    description: 'Evaluate tenders against published criteria; conduct moderation',
    minimumDays: 21,
    isMandatory: true,
    tasks: [
      { title: 'Open and record all submissions', description: 'Register all submissions received by deadline', isMandatory: true, sortOrder: 1 },
      { title: 'Conduct exclusion and selection checks', description: 'Verify mandatory exclusion grounds, financial standing, insurance', isMandatory: true, sortOrder: 2 },
      { title: 'Technical/functional evaluation (per evaluation criteria)', description: 'Score each submission against published criteria', isMandatory: true, sortOrder: 3 },
      { title: 'Commercial evaluation (price/cost analysis)', description: 'TCO analysis, value for money assessment', isMandatory: true, sortOrder: 4 },
      { title: 'Moderation meeting', description: 'Cross-evaluator moderation to agree final scores', isMandatory: true, sortOrder: 5 },
      { title: 'Complete evaluation report', description: 'Document all scores and rationale', isMandatory: true, sortOrder: 6 },
      { title: 'Obtain approval of evaluation outcome', description: 'SRO and Governing Body approval of preferred supplier', isMandatory: true, sortOrder: 7 },
    ],
    requiredApprovals: [
      { approverRole: 'SRO', description: 'Evaluation outcome approval' },
      { approverRole: 'GOVERNING_BODY', description: 'Governing body approval for contracts above £1m' },
    ],
    complianceCheckCodes: ['EVALUATION_COMPLETE', 'EVALUATION_APPROVED'],
  },
  {
    stageCode: 'STANDSTILL',
    stageName: 'Mandatory Standstill Period',
    stageOrder: 6,
    description: 'Mandatory 8-day standstill under Procurement Act 2023 before contract execution',
    minimumDays: 8,
    isMandatory: true,
    tasks: [
      { title: 'Issue Award Decision Notices to all tenderers', description: 'Inform all bidders of the outcome with scores and summary reasons', isMandatory: true, sortOrder: 1 },
      { title: 'Publish Transparency Notice on Find a Tender', description: 'Required pre-award transparency notice', isMandatory: true, sortOrder: 2 },
      { title: 'Handle any pre-award clarifications', description: 'Respond to bidder queries during standstill', isMandatory: false, sortOrder: 3 },
      { title: 'Confirm no challenges received after standstill expiry', description: 'Document that no automatic suspension applies', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['AWARD_NOTICES_SENT', 'STANDSTILL_PERIOD_MET'],
  },
  {
    stageCode: 'AWARD',
    stageName: 'Contract Award',
    stageOrder: 7,
    description: 'Execute contract, publish Award Notice, update contracts register',
    minimumDays: 7,
    isMandatory: true,
    tasks: [
      { title: 'Execute contract with successful supplier', description: 'Signed contract — retain original for audit', isMandatory: true, sortOrder: 1 },
      { title: 'Publish Contract Award Notice on Find a Tender', description: 'Must be published within 30 days of award', isMandatory: true, sortOrder: 2 },
      { title: 'Send debrief invitations to unsuccessful tenderers', description: 'Offer debriefs to all unsuccessful bidders within 30 days', isMandatory: true, sortOrder: 3 },
      { title: 'Update contracts register', description: 'Register the awarded contract with value and term', isMandatory: true, sortOrder: 4 },
      { title: 'Initiate supplier onboarding', description: 'KYC checks, data processing agreement, implementation kick-off', isMandatory: true, sortOrder: 5 },
    ],
    requiredApprovals: [
      { approverRole: 'PROCUREMENT_LEAD', description: 'Contract execution authorisation' },
    ],
    complianceCheckCodes: ['CONTRACT_EXECUTED', 'AWARD_NOTICE_PUBLISHED'],
  },
];

const EU_STAGES: StageDefinition[] = [
  {
    stageCode: 'PLANNING',
    stageName: 'Planning & Needs Assessment',
    stageOrder: 1,
    description: 'Define requirements, assess market, prepare procurement strategy',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Define contracting authority and legal basis', description: 'Confirm entity type and applicable directive', isMandatory: true, sortOrder: 1 },
      { title: 'Conduct needs assessment', description: 'Define functional and technical needs', isMandatory: true, sortOrder: 2 },
      { title: 'Estimate contract value (including all lots)', description: 'Correct aggregation of contract value for threshold check', isMandatory: true, sortOrder: 3 },
      { title: 'Select procurement procedure', description: 'Open, restricted, competitive dialogue, etc.', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['THRESHOLD_CHECK'],
  },
  {
    stageCode: 'SPECIFICATION',
    stageName: 'Technical Specifications',
    stageOrder: 2,
    description: 'Prepare ESPD, technical specifications, award criteria',
    minimumDays: 21,
    isMandatory: true,
    tasks: [
      { title: 'Prepare European Single Procurement Document (ESPD)', description: 'Mandatory self-declaration of exclusion grounds and selection criteria', isMandatory: true, sortOrder: 1 },
      { title: 'Draft technical specifications', description: 'Must reference standards, not brand names', isMandatory: true, sortOrder: 2 },
      { title: 'Define award criteria using MEAT', description: 'Most Economically Advantageous Tender — document all criteria and weightings', isMandatory: true, sortOrder: 3 },
      { title: 'Prepare contract documents', description: 'Terms and conditions, performance requirements', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [
      { approverRole: 'PROCUREMENT_LEAD', description: 'Specification approval' },
    ],
    complianceCheckCodes: ['ESPD_PREPARED', 'AWARD_CRITERIA_DEFINED'],
  },
  {
    stageCode: 'NOTICE',
    stageName: 'Contract Notice (TED)',
    stageOrder: 3,
    description: 'Publish Contract Notice on TED; minimum 35-day open tender period',
    minimumDays: 35,
    isMandatory: true,
    tasks: [
      { title: 'Publish Contract Notice on TED via eSender', description: 'Submit via national eSender to Tenders Electronic Daily', isMandatory: true, sortOrder: 1 },
      { title: 'Ensure electronic access to all documents', description: 'Direct, unrestricted, free access from date of notice', isMandatory: true, sortOrder: 2 },
      { title: 'Handle clarification questions (publish all)', description: 'Publish Q&As no later than 6 days before deadline', isMandatory: true, sortOrder: 3 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['NOTICE_PUBLISHED_TED', 'MINIMUM_TENDER_PERIOD'],
  },
  {
    stageCode: 'EVALUATION',
    stageName: 'Tender Evaluation',
    stageOrder: 4,
    description: 'Evaluate submissions against ESPD, selection criteria, and award criteria',
    minimumDays: 21,
    isMandatory: true,
    tasks: [
      { title: 'Open submissions and verify completeness', description: 'Log all submissions received', isMandatory: true, sortOrder: 1 },
      { title: 'Assess ESPD declarations', description: 'Verify exclusion grounds and selection criteria', isMandatory: true, sortOrder: 2 },
      { title: 'Evaluate tenders against award criteria', description: 'Score all qualifying tenders', isMandatory: true, sortOrder: 3 },
      { title: 'Check for abnormally low tenders', description: 'Must request explanation and document assessment', isMandatory: true, sortOrder: 4 },
      { title: 'Prepare evaluation report', description: 'Document all scores with rationale', isMandatory: true, sortOrder: 5 },
    ],
    requiredApprovals: [
      { approverRole: 'PROCUREMENT_LEAD', description: 'Evaluation sign-off' },
    ],
    complianceCheckCodes: ['EVALUATION_COMPLETE'],
  },
  {
    stageCode: 'STANDSTILL',
    stageName: 'Alcatel Standstill (10 Days)',
    stageOrder: 5,
    description: '10-day mandatory standstill before contract execution',
    minimumDays: 10,
    isMandatory: true,
    tasks: [
      { title: 'Issue award decision letters to all tenderers', description: 'Individual notification with scores, relative advantages of winner, and reasons', isMandatory: true, sortOrder: 1 },
      { title: 'Await expiry of standstill period', description: '10 calendar days from day after all notifications sent', isMandatory: true, sortOrder: 2 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['AWARD_NOTICES_SENT', 'STANDSTILL_PERIOD_MET'],
  },
  {
    stageCode: 'AWARD',
    stageName: 'Contract Award',
    stageOrder: 6,
    description: 'Execute contract and publish Contract Award Notice on TED',
    minimumDays: 7,
    isMandatory: true,
    tasks: [
      { title: 'Sign contract', description: 'Formal execution of contract', isMandatory: true, sortOrder: 1 },
      { title: 'Publish Contract Award Notice on TED (within 30 days)', description: 'Required within 30 days of contract award decision', isMandatory: true, sortOrder: 2 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['CONTRACT_EXECUTED', 'AWARD_NOTICE_PUBLISHED'],
  },
];

const US_FEDERAL_STAGES: StageDefinition[] = [
  {
    stageCode: 'MARKET_RESEARCH',
    stageName: 'Market Research',
    stageOrder: 1,
    description: 'FAR Part 10 market research to determine acquisition approach',
    minimumDays: 10,
    isMandatory: true,
    tasks: [
      { title: 'Conduct FAR Part 10 market research', description: 'Identify qualified sources, catalog availability, commercial availability', isMandatory: true, sortOrder: 1 },
      { title: 'Publish Sources Sought notice on SAM.gov (if appropriate)', description: 'Request capability statements from potential offerors', isMandatory: false, sortOrder: 2 },
      { title: 'Determine small business set-aside applicability', description: 'Apply Rule of Two — are ≥2 small businesses capable and competitive?', isMandatory: true, sortOrder: 3 },
      { title: 'Document market research results', description: 'Required by FAR 10.002 — retain in contract file', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['MARKET_RESEARCH_DOCUMENTED'],
  },
  {
    stageCode: 'SPECIFICATION',
    stageName: 'Requirements & SOW',
    stageOrder: 2,
    description: 'Develop Statement of Work, Performance Work Statement, or Statement of Objectives',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Prepare Statement of Work (SOW) or Performance Work Statement (PWS)', description: 'Clear, performance-based requirements', isMandatory: true, sortOrder: 1 },
      { title: 'Develop Independent Government Cost Estimate (IGCE)', description: 'Required before solicitation', isMandatory: true, sortOrder: 2 },
      { title: 'Determine contract type (FFP, T&M, CPFF, etc.)', description: 'Select appropriate FAR contract type', isMandatory: true, sortOrder: 3 },
      { title: 'Obtain acquisition plan approval', description: 'Required above certain thresholds', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [
      { approverRole: 'CONTRACTING_OFFICER', description: 'Acquisition plan approval' },
    ],
    complianceCheckCodes: ['SOW_APPROVED', 'IGCE_COMPLETED'],
  },
  {
    stageCode: 'SOLICITATION',
    stageName: 'Solicitation (SAM.gov)',
    stageOrder: 3,
    description: 'Publish solicitation on SAM.gov; minimum 30-day response period for full & open',
    minimumDays: 30,
    isMandatory: true,
    tasks: [
      { title: 'Publish solicitation on SAM.gov', description: 'Required — system for all federal acquisition opportunities', isMandatory: true, sortOrder: 1 },
      { title: 'Issue RFP/IFB to eligible offerors', description: 'Full solicitation package with all attachments', isMandatory: true, sortOrder: 2 },
      { title: 'Handle questions and amendments', description: 'Issue amendments via SAM.gov; distribute to all offerors', isMandatory: true, sortOrder: 3 },
      { title: 'Conduct any pre-proposal conferences', description: 'Optional — document attendance and Q&As', isMandatory: false, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['SAM_PUBLISHED', 'MINIMUM_RESPONSE_PERIOD'],
  },
  {
    stageCode: 'EVALUATION',
    stageName: 'Source Selection',
    stageOrder: 4,
    description: 'Evaluate proposals per Source Selection Plan; best value determination',
    minimumDays: 21,
    isMandatory: true,
    tasks: [
      { title: 'Verify SAM.gov registrations for all offerors', description: 'Active SAM registration required for contract award', isMandatory: true, sortOrder: 1 },
      { title: 'Evaluate proposals per evaluation factors', description: 'Score per Source Selection Plan criteria', isMandatory: true, sortOrder: 2 },
      { title: 'Conduct cost/price analysis', description: 'Fair and reasonable price determination', isMandatory: true, sortOrder: 3 },
      { title: 'Prepare Source Selection Decision Document (SSDD)', description: 'Document best value determination rationale', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [
      { approverRole: 'SOURCE_SELECTION_AUTHORITY', description: 'Source selection decision' },
    ],
    complianceCheckCodes: ['SSDD_COMPLETE'],
  },
  {
    stageCode: 'AWARD',
    stageName: 'Contract Award',
    stageOrder: 5,
    description: 'Award contract, notify unsuccessful offerors, update SAM.gov',
    minimumDays: 7,
    isMandatory: true,
    tasks: [
      { title: 'Execute contract (sign award document)', description: 'Contracting Officer signs — this is the official award', isMandatory: true, sortOrder: 1 },
      { title: 'Publish award notice on SAM.gov', description: 'Required within 3 days of award ≥$3,500', isMandatory: true, sortOrder: 2 },
      { title: 'Notify unsuccessful offerors', description: 'Written notification of award decision', isMandatory: true, sortOrder: 3 },
      { title: 'Offer debriefs to unsuccessful offerors (within 5 days)', description: 'Required if requested within 3 days of notification', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['CONTRACT_EXECUTED'],
  },
];

const AU_STAGES: StageDefinition[] = [
  {
    stageCode: 'PLANNING',
    stageName: 'Procurement Planning',
    stageOrder: 1,
    description: 'Plan procurement; confirm value for money approach and probity arrangements',
    minimumDays: 10,
    isMandatory: true,
    tasks: [
      { title: 'Confirm value for money approach', description: 'Document how value for money will be achieved', isMandatory: true, sortOrder: 1 },
      { title: 'Establish probity arrangements', description: 'Appoint probity advisor for complex procurements >$7.5m', isMandatory: false, sortOrder: 2 },
      { title: 'Check whole-of-government panel arrangements', description: 'Must use existing panels/arrangements if applicable (e.g., SONs)', isMandatory: true, sortOrder: 3 },
      { title: 'Confirm Indigenous Procurement Policy (IPP) obligations', description: 'IPP targets apply for contracts >$7.5m or in remote areas', isMandatory: false, sortOrder: 4 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['VFM_APPROACH_DOCUMENTED'],
  },
  {
    stageCode: 'MARKET_ANALYSIS',
    stageName: 'Market Analysis',
    stageOrder: 2,
    description: 'Engage market, understand supply landscape, consider SME participation',
    minimumDays: 10,
    isMandatory: true,
    tasks: [
      { title: 'Conduct market analysis', description: 'Research supply market including SME capability', isMandatory: true, sortOrder: 1 },
      { title: 'Consider ICT SME participation strategy', description: 'CPR requirement to consider ICT SME participation', isMandatory: false, sortOrder: 2 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['MARKET_ANALYSIS_COMPLETE'],
  },
  {
    stageCode: 'SPECIFICATION',
    stageName: 'Specification & Documentation',
    stageOrder: 3,
    description: 'Prepare Statement of Requirement and evaluation criteria',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Prepare Statement of Requirement (SOR)', description: 'Clear, outcome-based requirements', isMandatory: true, sortOrder: 1 },
      { title: 'Define evaluation criteria', description: 'Document mandatory and value-for-money criteria', isMandatory: true, sortOrder: 2 },
      { title: 'Prepare Approach to Market (ATM) documents', description: 'RFT, RFP, or ITQ documentation', isMandatory: true, sortOrder: 3 },
    ],
    requiredApprovals: [
      { approverRole: 'CHIEF_PROCUREMENT_OFFICER', description: 'Procurement documentation approval' },
    ],
    complianceCheckCodes: ['SPEC_APPROVED'],
  },
  {
    stageCode: 'APPROACH',
    stageName: 'Approach to Market (AusTender)',
    stageOrder: 4,
    description: 'Publish on AusTender; minimum 25 days for open approach to market',
    minimumDays: 25,
    isMandatory: true,
    tasks: [
      { title: 'Publish Approach to Market on AusTender', description: 'Required for all procurements above $80,000', isMandatory: true, sortOrder: 1 },
      { title: 'Make all documents available electronically', description: 'Freely available from AusTender', isMandatory: true, sortOrder: 2 },
      { title: 'Respond to supplier questions', description: 'Publish Q&As to all respondents', isMandatory: true, sortOrder: 3 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['AUSTENDER_PUBLISHED', 'MINIMUM_ATM_PERIOD'],
  },
  {
    stageCode: 'EVALUATION',
    stageName: 'Evaluation',
    stageOrder: 5,
    description: 'Evaluate responses; conduct value for money assessment',
    minimumDays: 14,
    isMandatory: true,
    tasks: [
      { title: 'Open and register all responses', description: 'Record all responses received', isMandatory: true, sortOrder: 1 },
      { title: 'Evaluate against mandatory criteria', description: 'Confirm all responses meet mandatory requirements', isMandatory: true, sortOrder: 2 },
      { title: 'Conduct value for money assessment', description: 'Score against published evaluation criteria', isMandatory: true, sortOrder: 3 },
      { title: 'Prepare evaluation report and recommendation', description: 'Document assessment and recommended supplier', isMandatory: true, sortOrder: 4 },
    ],
    requiredApprovals: [
      { approverRole: 'DELEGATE', description: 'Financial delegate approval for award' },
    ],
    complianceCheckCodes: ['EVALUATION_COMPLETE', 'VFM_ASSESSMENT_DONE'],
  },
  {
    stageCode: 'AWARD',
    stageName: 'Contract Award',
    stageOrder: 6,
    description: 'Execute contract and publish Award Notice on AusTender',
    minimumDays: 7,
    isMandatory: true,
    tasks: [
      { title: 'Execute contract', description: 'Signed contract — retain original', isMandatory: true, sortOrder: 1 },
      { title: 'Publish Contract Notice on AusTender (within 42 days)', description: 'Required within 42 days of contract commencement', isMandatory: true, sortOrder: 2 },
      { title: 'Notify unsuccessful respondents', description: 'Inform all unsuccessful respondents of outcome', isMandatory: true, sortOrder: 3 },
    ],
    requiredApprovals: [],
    complianceCheckCodes: ['CONTRACT_EXECUTED', 'AWARD_NOTICE_PUBLISHED'],
  },
];

const JURISDICTION_STAGES: Record<string, StageDefinition[]> = {
  UK: UK_STAGES,
  EU: EU_STAGES,
  US_FEDERAL: US_FEDERAL_STAGES,
  US_STATE: US_FEDERAL_STAGES, // fallback to federal as base
  AU: AU_STAGES,
};

// ── Procurement Engine ─────────────────────────────────────────────────────────

export class ProcurementEngine {

  getStageDefinitions(jurisdictionCode: string): StageDefinition[] {
    return JURISDICTION_STAGES[jurisdictionCode] ?? UK_STAGES;
  }

  async createProjectWithStages(params: {
    name: string;
    description?: string;
    institutionId: string;
    jurisdiction: string;
    basketId?: string;
    estimatedValue?: number;
    procurementRoute?: string;
    startDate?: Date;
  }) {
    const stages = this.getStageDefinitions(params.jurisdiction);
    const startDate = params.startDate ?? new Date();

    // Calculate dates
    const stageDates = this.calculateStageDates(stages, startDate);

    return prisma.$transaction(async (tx) => {
      const project = await tx.procurementProject.create({
        data: {
          name: params.name,
          description: params.description,
          institutionId: params.institutionId,
          jurisdiction: params.jurisdiction,
          basketId: params.basketId,
          estimatedValue: params.estimatedValue ?? null,
          procurementRoute: params.procurementRoute ?? 'open',
          startDate: params.startDate ?? null,
          targetAwardDate: stageDates[stageDates.length - 1]?.endDate ?? null,
          status: 'active',
        },
      });

      // Create old-style workflow for backward compat
      const workflow = await tx.procurementWorkflow.create({
        data: {
          projectId: project.id,
          currentStage: 1,
          stages: {
            create: stages.map((s, i) => ({
              stageNumber: i + 1,
              title: s.stageName,
              status: i === 0 ? 'active' : 'pending',
            })),
          },
        },
      });

      // Create new-style stages with tasks and approvals
      for (const stage of stages) {
        const dates = stageDates[stage.stageOrder - 1];
        const createdStage = await tx.procurementStage.create({
          data: {
            projectId: project.id,
            stageCode: stage.stageCode,
            stageName: stage.stageName,
            stageOrder: stage.stageOrder,
            status: stage.stageOrder === 1 ? 'IN_PROGRESS' : 'NOT_STARTED',
            startDate: stage.stageOrder === 1 ? startDate : null,
            dueDate: dates?.endDate ?? null,
            complianceChecks: stage.complianceCheckCodes as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        });

        // Create tasks
        await tx.stageTask.createMany({
          data: stage.tasks.map(t => ({
            stageId: createdStage.id,
            title: t.title,
            description: t.description,
            isMandatory: t.isMandatory,
            sortOrder: t.sortOrder,
            isCompleted: false,
          })),
        });

        // Create approval placeholders
        for (const approval of stage.requiredApprovals) {
          await tx.stageApproval.create({
            data: {
              stageId: createdStage.id,
              approverRole: approval.approverRole,
              status: 'pending',
            },
          });
        }
      }

      return { ...project, workflowId: workflow.id };
    });
  }

  calculateStageDates(stages: StageDefinition[], startDate: Date): Array<{ startDate: Date; endDate: Date }> {
    const dates: Array<{ startDate: Date; endDate: Date }> = [];
    let current = new Date(startDate);
    for (const stage of stages) {
      const stageStart = new Date(current);
      const stageEnd = new Date(current);
      stageEnd.setDate(stageEnd.getDate() + stage.minimumDays);
      dates.push({ startDate: stageStart, endDate: stageEnd });
      current = new Date(stageEnd);
    }
    return dates;
  }

  generateTimeline(stages: StageDefinition[], startDate: Date): TimelineEntry[] {
    const dates = this.calculateStageDates(stages, startDate);
    return stages.map((stage, i) => {
      const keyDeadlines: Array<{ label: string; date: Date }> = [];
      if (stage.stageCode === 'NOTICE') {
        const deadline = new Date(dates[i].startDate);
        deadline.setDate(deadline.getDate() + stage.minimumDays);
        keyDeadlines.push({ label: 'Tender Close', date: deadline });
      }
      if (stage.stageCode === 'STANDSTILL') {
        const end = new Date(dates[i].startDate);
        end.setDate(end.getDate() + stage.minimumDays);
        keyDeadlines.push({ label: 'Standstill Expiry', date: end });
      }
      return {
        stageCode: stage.stageCode,
        stageName: stage.stageName,
        startDate: dates[i].startDate,
        endDate: dates[i].endDate,
        minimumDays: stage.minimumDays,
        isStatutory: ['NOTICE', 'STANDSTILL'].includes(stage.stageCode),
        keyDeadlines,
      };
    });
  }

  async runComplianceCheck(projectId: string): Promise<ComplianceResult> {
    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      include: {
        stages: {
          include: {
            tasks: true,
            approvals: true,
          },
        },
      },
    });
    if (!project) return { passed: false, failures: [{ check: 'PROJECT_EXISTS', requirement: 'Project must exist', status: 'failed', remediation: 'Check project ID' }] };

    const failures: ComplianceResult['failures'] = [];
    const currentStage = project.stages.find(s => s.status === 'IN_PROGRESS' || s.status === 'AWAITING_APPROVAL');
    if (!currentStage) return { passed: true, failures: [] };

    // Check mandatory tasks
    const mandatoryTasks = currentStage.tasks.filter(t => t.isMandatory && !t.isCompleted);
    for (const task of mandatoryTasks) {
      failures.push({
        check: `TASK_${task.id}`,
        requirement: `Mandatory task must be completed: "${task.title}"`,
        status: 'failed',
        remediation: `Complete the task: ${task.description ?? task.title}`,
      });
    }

    // Check approvals
    const pendingApprovals = currentStage.approvals.filter(a => a.status === 'pending');
    for (const approval of pendingApprovals) {
      failures.push({
        check: `APPROVAL_${approval.id}`,
        requirement: `Approval required from: ${approval.approverRole}`,
        status: 'pending',
        remediation: `Obtain approval from ${approval.approverRole} before advancing`,
      });
    }

    return { passed: failures.length === 0, failures };
  }

  async advanceStage(
    projectId: string,
    actor?: { userId?: string; name?: string },
  ): Promise<{ success: boolean; newStage?: string; failures?: ComplianceResult['failures'] }> {
    const compliance = await this.runComplianceCheck(projectId);
    if (!compliance.passed) {
      return { success: false, failures: compliance.failures };
    }

    const project = await prisma.procurementProject.findUnique({
      where: { id: projectId },
      include: { stages: { orderBy: { stageOrder: 'asc' } } },
    });
    if (!project) return { success: false, failures: [{ check: 'NOT_FOUND', requirement: 'Project exists', status: 'failed', remediation: 'Check project ID' }] };

    const currentIndex = project.stages.findIndex(s => s.status === 'IN_PROGRESS');
    if (currentIndex === -1) return { success: false, failures: [{ check: 'NO_ACTIVE_STAGE', requirement: 'Active stage exists', status: 'failed', remediation: 'No active stage found' }] };

    const currentStage = project.stages[currentIndex];
    const nextStage = project.stages[currentIndex + 1];

    await prisma.$transaction(async (tx) => {
      await tx.procurementStage.update({
        where: { id: currentStage.id },
        data: { status: 'COMPLETED', completedDate: new Date() },
      });
      if (nextStage) {
        await tx.procurementStage.update({
          where: { id: nextStage.id },
          data: { status: 'IN_PROGRESS', startDate: new Date() },
        });
      } else {
        await tx.procurementProject.update({
          where: { id: projectId },
          data: { status: 'awarded' },
        });
      }
      // Audit trail — sits inside the same tx as the state change so the
      // log cannot drift out of sync with the stage status. `changes`
      // captures from/to codes plus whether this was the terminal
      // transition (project → awarded). An awarded project is the
      // single most commercially significant event in the workflow;
      // losing its audit row would be a governance failure.
      await tx.auditLog.create({
        data: {
          userId: actor?.userId ?? null,
          action: 'procurement.stage.advance',
          entityType: 'ProcurementProject',
          entityId: projectId,
          changes: {
            fromStage: currentStage.stageCode,
            toStage: nextStage?.stageCode ?? null,
            awarded: !nextStage,
            actorName: actor?.name ?? null,
          },
        },
      });
    });

    return { success: true, newStage: nextStage?.stageCode };
  }

  calculateEvaluationScores(
    evaluations: Array<{
      systemId: string;
      systemName: string;
      hermScore?: number;
      technicalScore?: number;
      commercialScore?: number;
      implementationScore?: number;
      referenceScore?: number;
    }>,
    weighting = { herm: 40, technical: 25, commercial: 20, implementation: 10, reference: 5 }
  ) {
    return evaluations.map(e => {
      const overall =
        ((e.hermScore ?? 0) * weighting.herm +
          (e.technicalScore ?? 0) * weighting.technical +
          (e.commercialScore ?? 0) * weighting.commercial +
          (e.implementationScore ?? 0) * weighting.implementation +
          (e.referenceScore ?? 0) * weighting.reference) / 100;

      const recommendation =
        overall >= 75 ? 'award' :
        overall >= 60 ? 'shortlist' :
        overall >= 45 ? 'reserve' : 'reject';

      return { ...e, overallScore: Math.round(overall * 10) / 10, recommendation };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }

  hermToSpecification(basketItems: Array<{ capability: { code: string; name: string; domain: { code: string; name: string } }; priority: string; weight: number; notes?: string | null }>) {
    const byDomain = new Map<string, { domainCode: string; domainName: string; items: typeof basketItems }>();

    for (const item of basketItems) {
      const fc = item.capability.domain.code;
      if (!byDomain.has(fc)) {
        byDomain.set(fc, { domainCode: fc, domainName: item.capability.domain.name, items: [] });
      }
      byDomain.get(fc)!.items.push(item);
    }

    const sections = Array.from(byDomain.values()).map(domain => ({
      domainCode: domain.domainCode,
      domainName: domain.domainName,
      requirements: domain.items.map(item => ({
        code: item.capability.code,
        name: item.capability.name,
        priority: item.priority,
        weight: item.weight,
        statement: `The system SHALL provide ${item.capability.name} functionality as defined in HERM v3.1 capability ${item.capability.code}.`,
        evaluationCriteria: [
          `Describe how the system delivers ${item.capability.name}`,
          'Provide evidence of implementation at comparable HE institutions',
          'Confirm compatibility with existing institutional systems',
        ],
        evidenceRequired: ['Tender response narrative', 'Product demonstration', 'Customer reference'],
        moscowPriority: item.priority === 'must' ? 'Must Have' : item.priority === 'should' ? 'Should Have' : 'Could Have',
      })),
    }));

    return sections;
  }
}

export const procurementEngine = new ProcurementEngine();
