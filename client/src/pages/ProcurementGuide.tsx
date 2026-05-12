import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronRight, ChevronUp, Info,
  CheckCircle, Clock, Users, FileText, Shield,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type Jurisdiction = 'UK' | 'EU' | 'US' | 'AU';
type ProcurementType = 'IT_SERVICES' | 'SOFTWARE_SAAS' | 'CONSULTING' | 'WORKS' | 'GOODS';

interface JurisdictionRow {
  label: string;
  uk: string;
  eu: string;
  us: string;
  au: string;
}

interface StageGuide {
  stageName: string;
  description: string;
  roles: string[];
  documents: string[];
  compliance: string[];
  minimumDays: number;
  isStatutory: boolean;
}

interface StageGuideByJurisdiction {
  jurisdiction: Jurisdiction;
  stages: StageGuide[];
}

interface DecisionResult {
  procedure: string;
  timeline: string;
  requirements: string[];
  thresholdStatus: string;
  jurisdiction: Jurisdiction;
  procurementType: ProcurementType;
}

// ── Static Data ────────────────────────────────────────────────────────────────

const JURISDICTION_FLAGS: Record<Jurisdiction, string> = {
  UK: '🇬🇧', EU: '🇪🇺', US: '🇺🇸', AU: '🇦🇺',
};

const COMPARISON_ROWS: JurisdictionRow[] = [
  {
    label: 'Governing Legislation',
    uk: 'Procurement Act 2023',
    eu: 'Directive 2014/24/EU',
    us: 'Federal Acquisition Regulation (FAR)',
    au: 'Commonwealth Procurement Rules (CPRs)',
  },
  {
    label: 'Goods/Services Threshold',
    uk: '£213,477',
    eu: '€221,000',
    us: '$250,000 (simplified acquisition)',
    au: 'AUD $80,000',
  },
  {
    label: 'Works Threshold',
    uk: '£5,336,937',
    eu: '€5,538,000',
    us: '$2,000,000',
    au: 'AUD $7,500,000',
  },
  {
    label: 'Minimum Tender Period',
    uk: '25 days (Open Procedure)',
    eu: '35 days (Open Procedure)',
    us: '30 days (FAR Part 15)',
    au: '25 days (above threshold)',
  },
  {
    label: 'Standstill Period',
    uk: '8 working days',
    eu: '10 calendar days',
    us: '5 calendar days (GAO protest window)',
    au: '10 business days',
  },
  {
    label: 'Notice Platform',
    uk: 'Find a Tender Service (FTS)',
    eu: 'Tenders Electronic Daily (TED)',
    us: 'SAM.gov',
    au: 'AusTender',
  },
  {
    label: 'Award Criteria',
    uk: 'Most advantageous tender (MAT)',
    eu: 'Most economically advantageous tender (MEAT)',
    us: 'Best value continuum / LPTA',
    au: 'Value for money principle',
  },
];

const STAGE_GUIDES: StageGuideByJurisdiction[] = [
  {
    jurisdiction: 'UK',
    stages: [
      {
        stageName: 'Requirements & Planning',
        description: 'Define the scope, budget, and specification. Conduct a preliminary market engagement. Agree the procurement strategy with the SRO.',
        roles: ['Senior Responsible Owner (SRO)', 'Procurement Lead', 'Finance Business Partner', 'Legal Adviser'],
        documents: ['Business Case', 'Procurement Strategy', 'Prior Information Notice (PIN) (optional)'],
        compliance: [
          'Comply with Public Contracts Regulations 2015 / Procurement Act 2023',
          'Publish PIN on FTS if above threshold and using reduced timescales',
          'Complete initial equalities impact assessment',
        ],
        minimumDays: 20,
        isStatutory: false,
      },
      {
        stageName: 'Market Engagement',
        description: 'Issue a Request for Information (RFI) or hold a soft market testing event. Review market responses to refine requirements.',
        roles: ['Procurement Lead', 'Technical Evaluator', 'Commercial Manager'],
        documents: ['Request for Information (RFI)', 'Market Engagement Report', 'Long list of potential suppliers'],
        compliance: [
          'Treat all market responses confidentially',
          'Do not exclude pre-market engagement suppliers without justification',
          'Document all market engagement activities',
        ],
        minimumDays: 15,
        isStatutory: false,
      },
      {
        stageName: 'Tender Publication',
        description: 'Publish the Contract Notice and ITT/RFP documents on Find a Tender Service. Manage the clarification period.',
        roles: ['Procurement Lead', 'Legal Adviser'],
        documents: ['Contract Notice (FTS)', 'Invitation to Tender (ITT)', 'Specification', 'Pricing Schedule'],
        compliance: [
          'Publish Contract Notice on FTS (above threshold)',
          'Minimum 25 days tender period (Open Procedure)',
          'Answer all clarification questions in writing and publish to all bidders',
          'Do not change award criteria after publication',
        ],
        minimumDays: 25,
        isStatutory: true,
      },
      {
        stageName: 'Evaluation',
        description: 'Evaluate tender responses against published criteria. Conduct moderation, demonstrations, and reference checks.',
        roles: ['Evaluation Panel', 'Technical Evaluator', 'Commercial Manager', 'Independent Moderator'],
        documents: ['Evaluation Report', 'Scoring Sheets', 'Moderation Record', 'Demonstration Report'],
        compliance: [
          'Use only the published award criteria and weightings',
          'Maintain complete records of all scoring decisions',
          'Conduct second-marker moderation where scores differ significantly',
          'Document conflicts of interest and exclusions',
        ],
        minimumDays: 20,
        isStatutory: false,
      },
      {
        stageName: 'Award & Standstill',
        description: 'Notify all tenderers of the award decision. Observe the mandatory standstill period before contract execution.',
        roles: ['SRO', 'Procurement Lead', 'Legal Adviser'],
        documents: ['Award Decision Notice', 'Standstill Letters (successful & unsuccessful)', 'Contract Award Notice (FTS)'],
        compliance: [
          'Issue standstill letters to all tenderers simultaneously',
          'Minimum 8 working day standstill period (Alcatel standstill)',
          'Publish Contract Award Notice on FTS within 30 days',
          'Do not execute contract during standstill period',
        ],
        minimumDays: 8,
        isStatutory: true,
      },
    ],
  },
  {
    jurisdiction: 'EU',
    stages: [
      {
        stageName: 'Planning & ESPD',
        description: 'Define requirements and prepare the European Single Procurement Document (ESPD). Determine the applicable procedure under Directive 2014/24/EU.',
        roles: ['Contracting Authority', 'Legal Adviser', 'Finance Director'],
        documents: ['Business Case', 'European Single Procurement Document (ESPD)', 'Prior Information Notice (optional)'],
        compliance: [
          'Ensure compliance with Directive 2014/24/EU as transposed in member state law',
          'Calculate estimated value including options and renewals',
          'Publish ESPD in machine-readable format (eESPD)',
        ],
        minimumDays: 20,
        isStatutory: false,
      },
      {
        stageName: 'Contract Notice (TED)',
        description: 'Publish the Contract Notice on Tenders Electronic Daily (TED / OJEU). Open the tender period.',
        roles: ['Procurement Officer', 'Legal Adviser'],
        documents: ['Contract Notice (TED/OJEU)', 'Technical Specifications', 'ESPD'],
        compliance: [
          'Publish Contract Notice in TED / Official Journal of the EU',
          'Minimum 35 days (Open Procedure) or 30 days with PIN',
          'Specifications must not discriminate against EU suppliers',
          'Use CPV codes for contract classification',
        ],
        minimumDays: 35,
        isStatutory: true,
      },
      {
        stageName: 'Evaluation & Award',
        description: 'Evaluate tenders using MEAT criteria. Select the most economically advantageous tender.',
        roles: ['Evaluation Committee', 'Procurement Officer', 'External Expert (optional)'],
        documents: ['Evaluation Report', 'MEAT Decision Record', 'Exclusion Grounds Check'],
        compliance: [
          'Apply MEAT criteria as published in the notice',
          'Check mandatory exclusion grounds (Article 57)',
          'Abnormally low tender check required if applicable',
          'Document all evaluation decisions fully',
        ],
        minimumDays: 30,
        isStatutory: false,
      },
      {
        stageName: 'Standstill & Contract',
        description: 'Issue debrief letters to all tenderers and observe the Alcatel standstill period before signing.',
        roles: ['Contracting Authority', 'Legal Adviser'],
        documents: ['Award Decision Notice', 'Debrief Letters', 'Contract Award Notice (OJEU)'],
        compliance: [
          'Minimum 10 calendar day standstill period',
          'Send simultaneous written notifications to all tenderers',
          'Publish Contract Award Notice in OJEU within 30 days of award',
          'Retain all tender documentation for 4 years minimum',
        ],
        minimumDays: 10,
        isStatutory: true,
      },
    ],
  },
  {
    jurisdiction: 'US',
    stages: [
      {
        stageName: 'Acquisition Planning',
        description: 'Develop the Acquisition Plan (AP) in accordance with FAR Part 7. Determine contract type and socioeconomic set-aside requirements.',
        roles: ['Contracting Officer (CO)', 'Program Manager', 'Contracting Officer Representative (COR)', 'Small Business Specialist'],
        documents: ['Acquisition Plan (AP)', 'Market Research Report', 'Independent Government Cost Estimate (IGCE)'],
        compliance: [
          'Comply with FAR Part 7 — Acquisition Planning',
          'Complete market research per FAR 10.002',
          'Determine socioeconomic set-aside applicability (FAR Part 19)',
          'Obtain required approvals for acquisition plan',
        ],
        minimumDays: 20,
        isStatutory: false,
      },
      {
        stageName: 'Solicitation (SAM.gov)',
        description: 'Post the solicitation on SAM.gov. Issue the Request for Proposal (RFP) or Invitation for Bid (IFB).',
        roles: ['Contracting Officer', 'Contract Specialist'],
        documents: ['Request for Proposal (RFP / SF-1449)', 'Statement of Work (SOW)', 'Section L & M (instructions and evaluation factors)'],
        compliance: [
          'Publish solicitation on SAM.gov (formerly FedBizOpps)',
          'Minimum 30 days for competitive sealed proposals',
          'Include all required FAR/DFARS clauses',
          'Section M must clearly state evaluation factors and their relative importance',
        ],
        minimumDays: 30,
        isStatutory: true,
      },
      {
        stageName: 'Proposal Evaluation',
        description: 'Evaluate proposals using the best value continuum. Conduct discussions/negotiations if using FAR Part 15.',
        roles: ['Source Selection Authority (SSA)', 'Source Selection Evaluation Board (SSEB)', 'Contracting Officer'],
        documents: ['Source Selection Plan', 'Technical Evaluation', 'Past Performance Assessment', 'Source Selection Decision Document (SSDD)'],
        compliance: [
          'Evaluate only against factors in Section M',
          'Conduct discussions with all offerors in competitive range (if applicable)',
          'Request Final Proposal Revisions (FPR) after discussions',
          'Document Source Selection Decision with supporting rationale',
        ],
        minimumDays: 25,
        isStatutory: false,
      },
      {
        stageName: 'Award & Notification',
        description: 'Award the contract and notify unsuccessful offerors. Observe protest period before contract performance.',
        roles: ['Contracting Officer', 'Program Manager', 'Agency Legal Counsel'],
        documents: ['Contract Award (FAR Part 15)', 'Award Announcement (SAM.gov)', 'Unsuccessful Offeror Notifications'],
        compliance: [
          'Notify unsuccessful offerors promptly after award',
          'Provide debriefs upon request (FAR 15.505/15.506)',
          '5 calendar day GAO protest window before performance',
          'Post contract award to FPDS-NG within 3 business days',
        ],
        minimumDays: 5,
        isStatutory: true,
      },
    ],
  },
  {
    jurisdiction: 'AU',
    stages: [
      {
        stageName: 'Procurement Planning',
        description: 'Plan the procurement approach in accordance with the Commonwealth Procurement Rules. Determine procurement method and risk.',
        roles: ['Chief Procurement Officer', 'Procurement Delegate', 'Finance Officer'],
        documents: ['Procurement Plan', 'Risk Assessment', 'AusTender registration'],
        compliance: [
          'Apply Commonwealth Procurement Rules (CPRs)',
          'Satisfy accountable authority requirements under PGPA Act',
          'Conduct procurement risk assessment',
          'Consider Indigenous Procurement Policy (IPP) obligations',
        ],
        minimumDays: 15,
        isStatutory: false,
      },
      {
        stageName: 'Approach to Market',
        description: 'Publish the Request for Tender (RFT) on AusTender. Manage supplier engagement.',
        roles: ['Procurement Officer', 'Legal Adviser'],
        documents: ['Request for Tender (RFT)', 'Conditions for Participation', 'Evaluation Criteria'],
        compliance: [
          'Publish RFT on AusTender (above threshold)',
          'Minimum 25 business days for open tender above threshold',
          'Apply value for money principle throughout',
          'Ensure equal opportunity for all eligible suppliers',
        ],
        minimumDays: 25,
        isStatutory: true,
      },
      {
        stageName: 'Evaluation',
        description: 'Evaluate tender responses against the published criteria using value for money assessment.',
        roles: ['Evaluation Panel', 'Procurement Officer', 'Subject Matter Expert'],
        documents: ['Evaluation Plan', 'Evaluation Report', 'Value for Money Assessment'],
        compliance: [
          'Apply only the published evaluation criteria',
          'Consider whole-of-life costs in value for money assessment',
          "Check supplier's performance history and financial viability",
          'Document all evaluation decisions in writing',
        ],
        minimumDays: 20,
        isStatutory: false,
      },
      {
        stageName: 'Contract Award',
        description: 'Award the contract following proper delegate approval. Publish contract notice on AusTender.',
        roles: ['Financial Delegate', 'Procurement Officer', 'Legal Adviser'],
        documents: ['Contract', 'Delegate Approval', 'AusTender Contract Notice', 'Unsuccessful Tenderer Notifications'],
        compliance: [
          'Obtain required financial delegate approval',
          'Publish contract details on AusTender within 42 days',
          'Notify unsuccessful tenderers and offer debriefs',
          'Observe 10 business day standstill before commencement',
        ],
        minimumDays: 10,
        isStatutory: true,
      },
    ],
  },
];

// ── Decision Tree Logic ───────────────────────────────────────────────────────

function getDecisionResult(
  jurisdiction: Jurisdiction,
  value: number,
  type: ProcurementType
): DecisionResult {
  const thresholds: Record<Jurisdiction, number> = {
    UK: 213477, EU: 221000, US: 250000, AU: 80000,
  };

  const threshold = thresholds[jurisdiction];
  const aboveThreshold = value > threshold;

  const procedures: Record<Jurisdiction, { above: string; below: string }> = {
    UK: {
      above: 'Open Procedure under UK Procurement Act 2023 (or Competitive Flexible Procedure for complex requirements)',
      below: 'Simplified Below-Threshold Procedure — competitive quotes recommended',
    },
    EU: {
      above: 'Open Procedure under EU Directive 2014/24/EU — OJEU publication required',
      below: 'National procedure — no OJEU publication required',
    },
    US: {
      above: 'FAR Part 15 Negotiated Procurement — RFP with Source Selection',
      below: 'FAR Part 13 Simplified Acquisition — quotation process',
    },
    AU: {
      above: 'Open Tender under Commonwealth Procurement Rules — AusTender publication required',
      below: 'Selective or limited tender — value for money justification required',
    },
  };

  const timelines: Record<Jurisdiction, { above: string; below: string }> = {
    UK: {
      above: 'Minimum 10–12 weeks from notice to award (25 day tender + 8 day standstill + evaluation)',
      below: 'Minimum 4–6 weeks (no statutory tender period)',
    },
    EU: {
      above: 'Minimum 12–16 weeks from notice to award (35 day tender + 10 day standstill + evaluation)',
      below: 'No minimum EU timescale — follow national rules',
    },
    US: {
      above: 'Minimum 10–14 weeks (30 day solicitation + evaluation + source selection + protest window)',
      below: 'Minimum 4–6 weeks under simplified acquisition procedures',
    },
    AU: {
      above: 'Minimum 10–12 weeks (25 day RFT + evaluation + standstill + approval)',
      below: 'Minimum 3–5 weeks (no mandatory RFT period)',
    },
  };

  const requirementsMap: Record<Jurisdiction, { above: string[]; below: string[] }> = {
    UK: {
      above: [
        'Publish Contract Notice on Find a Tender Service (FTS)',
        'Issue Invitation to Tender (ITT) with full specification',
        '25 calendar day minimum tender period',
        '8 working day Alcatel standstill after award notification',
        'Publish Contract Award Notice on FTS within 30 days',
        type === 'SOFTWARE_SAAS' ? 'Crown Commercial Service framework route may be available' : 'G-Cloud / DOS framework route may be available',
      ],
      below: [
        'Competitive quotes from minimum 3 suppliers recommended',
        'No FTS publication required',
        'Document value for money justification',
        'Apply departmental financial delegation rules',
      ],
    },
    EU: {
      above: [
        'Publish Contract Notice in the Official Journal of the EU (OJEU/TED)',
        'Use ESPD for supplier self-declaration',
        '35 calendar day minimum tender period (Open Procedure)',
        '10 calendar day Alcatel standstill',
        'Apply non-discrimination and equal treatment principles',
        'Publish Contract Award Notice within 30 days',
      ],
      below: [
        'No OJEU publication required',
        'Follow national procurement rules',
        'Equal treatment principles still apply',
        'Document procurement decision',
      ],
    },
    US: {
      above: [
        'Publish solicitation on SAM.gov',
        'Include all required FAR/DFARS clauses in solicitation',
        '30 calendar day minimum solicitation period',
        'Section M must define all evaluation factors',
        'Conduct discussions if using negotiated procurement',
        'Post award to FPDS-NG within 3 business days',
      ],
      below: [
        'SAM.gov posting may not be required below $25,000',
        'Minimum 3 quotes for simplified acquisition',
        'Competition in contracting act still applies',
        'Use purchase order or BPA as appropriate',
      ],
    },
    AU: {
      above: [
        'Publish RFT on AusTender',
        '25 business day minimum tender period',
        'Apply Commonwealth Procurement Rules throughout',
        'Consider Indigenous Procurement Policy obligations',
        '10 business day standstill before commencement',
        'Publish contract notice on AusTender within 42 days',
      ],
      below: [
        'AusTender publication not mandatory',
        'Competitive quotes recommended for value for money',
        'Financial delegate approval required',
        'Document value for money assessment',
      ],
    },
  };

  return {
    procedure: aboveThreshold ? procedures[jurisdiction].above : procedures[jurisdiction].below,
    timeline: aboveThreshold ? timelines[jurisdiction].above : timelines[jurisdiction].below,
    requirements: aboveThreshold ? requirementsMap[jurisdiction].above : requirementsMap[jurisdiction].below,
    thresholdStatus: aboveThreshold
      ? `Above threshold (${jurisdiction === 'AU' ? 'AUD ' : ''}${value.toLocaleString('en-GB')} > ${threshold.toLocaleString('en-GB')}) — full competition required`
      : `Below threshold (${jurisdiction === 'AU' ? 'AUD ' : ''}${value.toLocaleString('en-GB')} < ${threshold.toLocaleString('en-GB')}) — simplified procedure available`,
    jurisdiction,
    procurementType: type,
  };
}

// ── Accordion component ───────────────────────────────────────────────────────

function Accordion({ title, children, defaultOpen = false }: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <span className="font-medium text-gray-900 dark:text-white">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="px-4 py-4 bg-white dark:bg-gray-800">{children}</div>}
    </div>
  );
}

// ── Section 1 — Decision Tree ─────────────────────────────────────────────────

function DecisionTreeSection({ onStartProject }: { onStartProject?: (j: Jurisdiction) => void }) {
  const { t } = useTranslation('procurement');
  const [step, setStep] = useState(0);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(null);
  const [value, setValue] = useState('');
  const [_type, setType] = useState<ProcurementType | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);

  const reset = () => {
    setStep(0);
    setJurisdiction(null);
    setValue('');
    setType(null);
    setResult(null);
  };

  const handleJurisdiction = (j: Jurisdiction) => {
    setJurisdiction(j);
    setStep(1);
  };

  const handleValue = () => {
    if (!value || Number(value) <= 0) return;
    setStep(2);
  };

  const handleType = (t: ProcurementType) => {
    if (!jurisdiction || !value) return;
    setType(t);
    setResult(getDecisionResult(jurisdiction, Number(value), t));
    setStep(3);
  };

  const PROCUREMENT_TYPES: { key: ProcurementType; label: string; icon: string }[] = [
    { key: 'IT_SERVICES', label: 'IT Services', icon: '💻' },
    { key: 'SOFTWARE_SAAS', label: 'Software / SaaS', icon: '☁️' },
    { key: 'CONSULTING', label: 'Consulting', icon: '📊' },
    { key: 'WORKS', label: 'Works / Construction', icon: '🏗️' },
    { key: 'GOODS', label: 'Goods / Equipment', icon: '📦' },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("guide.findRoute", "Find Your Procurement Route")}</h2>
        {step > 0 && (
          <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Start over
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-6">
        {['Jurisdiction', 'Value', 'Type', 'Result'].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              i < step ? 'bg-teal-600 text-white' :
              i === step ? 'bg-teal-600 text-white ring-2 ring-teal-200' :
              'bg-gray-200 dark:bg-gray-700 text-gray-400'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${i === step ? 'text-teal-700 dark:text-teal-400 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < 3 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 0 — Jurisdiction */}
      {step === 0 && (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t("guide.selectJurisdiction", "Select your jurisdiction:")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['UK', 'EU', 'US', 'AU'] as Jurisdiction[]).map((j) => (
              <button
                key={j}
                onClick={() => handleJurisdiction(j)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
              >
                <span className="text-3xl">{JURISDICTION_FLAGS[j]}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{j}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1 — Value */}
      {step === 1 && (
        <div className="max-w-sm">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {/*
              UAT D-03 — bare-emoji JSX text-node interpolation rendered as
              "as What is the estimated contract value?" on some platforms
              where flag emoji fall back to their regional-indicator letters
              (e.g. AU 🇦🇺 → "AU"/"as"). Wrapping the flag in a span with
              aria-hidden separates the icon from the label and keeps screen
              readers from announcing the regional-indicator letters.
            */}
            {jurisdiction && (
              <span aria-hidden="true" className="mr-1">
                {JURISDICTION_FLAGS[jurisdiction]}
              </span>
            )}
            What is the estimated contract value?
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 500000"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleValue()}
            />
            <Button onClick={handleValue} disabled={!value || Number(value) <= 0}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — Type */}
      {step === 2 && (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t("guide.whatType", "What type of procurement?")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROCUREMENT_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => handleType(t.key)}
                className="flex items-center gap-2 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors text-left"
              >
                <span className="text-xl">{t.icon}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Result */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1">{t("guide.recommendedProcedure", "Recommended Procedure")}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{result.procedure}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t("guide.estimatedTimeline", "Estimated Timeline")}</p>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{result.timeline}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t("guide.thresholdStatus", "Threshold Status")}</p>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{result.thresholdStatus}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">{t("guide.keyRequirements", "Key Requirements")}</p>
            <ul className="space-y-1.5">
              {result.requirements.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>

          {onStartProject && (
            <Button onClick={() => onStartProject(result.jurisdiction)} className="w-full">
              Start a Project with These Settings
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Section 2 — Jurisdiction Comparison ──────────────────────────────────────

function ComparisonSection() {
  const { t } = useTranslation('procurement');

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("guide.comparison", "Jurisdiction Comparison")}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t("guide.keyRegulatoryRequirements", "Key regulatory requirements by jurisdiction")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-40">{t("guide.criterion", "Criterion")}</th>
              {(['UK', 'EU', 'US', 'AU'] as const).map((j) => (
                <th key={j} className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                  <span className="mr-1">{JURISDICTION_FLAGS[j]}</span>{j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {COMPARISON_ROWS.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 text-xs">{row.label}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{row.uk}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{row.eu}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{row.us}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{row.au}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Section 3 — Stage Guide ───────────────────────────────────────────────────

function StageGuideSection() {
  const { t } = useTranslation('procurement');
  const [activeJurisdiction, setActiveJurisdiction] = useState<Jurisdiction>('UK');

  const guideData = STAGE_GUIDES.find((g) => g.jurisdiction === activeJurisdiction);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("guide.stageGuide", "Stage-by-Stage Guide")}</h2>
      </div>

      {/* Jurisdiction tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {(['UK', 'EU', 'US', 'AU'] as Jurisdiction[]).map((j) => (
          <button
            key={j}
            onClick={() => setActiveJurisdiction(j)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeJurisdiction === j
                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <span>{JURISDICTION_FLAGS[j]}</span>
            <span>{j}</span>
          </button>
        ))}
      </div>

      {/* Stages accordion */}
      <div className="space-y-2">
        {guideData?.stages.map((stage, i) => (
          <Accordion
            key={`${activeJurisdiction}-${i}`}
            defaultOpen={i === 0}
            title={
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span>{stage.stageName}</span>
                {stage.isStatutory && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-normal">
                    Statutory minimum
                  </span>
                )}
                <span className="text-xs text-gray-400 font-normal ml-auto mr-4">
                  {stage.minimumDays} days min
                </span>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">{stage.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Who's involved */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-4 h-4 text-blue-500" />
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{t("guide.whosInvolved", "Who's Involved")}</h4>
                  </div>
                  <ul className="space-y-1">
                    {stage.roles.map((role, ri) => (
                      <li key={ri} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                        <span className="text-gray-400 mt-0.5">•</span>
                        <span>{role}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Key documents */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{t("guide.keyDocuments", "Key Documents")}</h4>
                  </div>
                  <ul className="space-y-1">
                    {stage.documents.map((doc, di) => (
                      <li key={di} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                        <span className="text-gray-400 mt-0.5">•</span>
                        <span>{doc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Compliance */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{t("guide.compliance", "Compliance")}</h4>
                  </div>
                  <ul className="space-y-1">
                    {stage.compliance.map((c, ci) => (
                      <li key={ci} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {stage.isStatutory && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>This stage has a statutory minimum duration of {stage.minimumDays} days that cannot be shortened.</span>
                </div>
              )}
            </div>
          </Accordion>
        ))}
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ProcurementGuide() {
  const { t } = useTranslation("procurement");
  const [activeSection, setActiveSection] = useState<'decision' | 'comparison' | 'guide'>('decision');

  const SECTIONS = [
    { key: "decision" as const, label: t("guide.decisionTree", "Decision Tree"), desc: t("guide.decisionTreeDesc", "Find your procurement route") },
    { key: "comparison" as const, label: t("guide.comparison", "Jurisdiction Comparison"), desc: t("guide.comparisonDesc", "Compare regulations side-by-side") },
    { key: "guide" as const, label: t("guide.stageGuide", "Stage-by-Stage Guide"), desc: t("guide.stageGuideDesc", "Detailed stage reference") },
  ];

  return (
    <div>
      <Header
        title={t("guide.title", "Procurement Guide")}
        subtitle={t("guide.subtitle", "Interactive guide to procurement procedures across UK, EU, US Federal, and Australian regulatory frameworks")}
      />

      {/* Section navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              activeSection === s.key
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
            }`}
          >
            <p className={`font-semibold text-sm ${activeSection === s.key ? 'text-teal-700 dark:text-teal-400' : 'text-gray-900 dark:text-white'}`}>
              {s.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
          </button>
        ))}
      </div>

      {/* Sections */}
      {activeSection === 'decision' && (
        <DecisionTreeSection />
      )}
      {activeSection === 'comparison' && (
        <ComparisonSection />
      )}
      {activeSection === 'guide' && (
        <StageGuideSection />
      )}
    </div>
  );
}
