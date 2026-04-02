import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';

const TABS = ['Scoring Model', 'Evidence Types', 'Review Process', 'FAQ'] as const;
type Tab = typeof TABS[number];

const SCORING_CONTENT = {
  title: 'The 0 / 50 / 100 Scoring System',
  intro: 'Each of the 165 HERM capabilities is scored for each system on a three-point scale based on native capability support.',
  scores: [
    {
      value: 100,
      label: 'Full Support',
      color: 'bg-green-100 text-green-800',
      barColor: 'bg-green-500',
      description: 'The capability is natively supported out of the box, without requiring additional modules, third-party add-ons, or workarounds. A trained implementer can configure it without custom development.',
      examples: ['SITS:Vision BC011 (Enrolment) — complete student registration workflow with fee calculations, UCAS import, and status tracking built in', 'Canvas BC029 (Learning Assessment) — full submission, grading, feedback, and rubrics all native'],
    },
    {
      value: 50,
      label: 'Partial Support',
      color: 'bg-amber-100 text-amber-800',
      barColor: 'bg-amber-500',
      description: 'The capability is available but requires additional configuration, an optional module, a licensed add-on, a third-party integration, or significant workaround. The core need can be met but not without additional effort or cost.',
      examples: ['Banner BC015 (Attendance Management) — available via third-party integration or Banner Workflow, not native', 'Workday Student BC086 (Compliance Management) — generic compliance tools available; HESA-specific rules need configuration partner'],
    },
    {
      value: 0,
      label: 'No Support',
      color: 'bg-red-100 text-red-800',
      barColor: 'bg-red-500',
      description: 'The capability is not available in the system and would require significant custom development, a separate specialist system, or is fundamentally outside the product scope.',
      examples: ['Canvas BC008 (Student Recruitment) — Canvas is an LMS; admissions is outside its scope entirely', 'campusM BC156 (Fundraising & Development) — mobile engagement platform; advancement management not in scope'],
    },
  ],
};

const EVIDENCE_TYPES = [
  { type: 'Vendor Documentation', weight: 'Primary', icon: '📄', desc: 'Official product documentation, data sheets, feature lists, and release notes published by the vendor.' },
  { type: 'Independent Testing', weight: 'Primary', icon: '🔬', desc: 'Direct hands-on evaluation of the system in a demo or sandbox environment by FHE analysts.' },
  { type: 'Implementation Experience', weight: 'Primary', icon: '🏗️', desc: 'Direct experience from HE institutions that have implemented the system, gathered via structured interviews and surveys.' },
  { type: 'Analyst Research', weight: 'Secondary', icon: '📊', desc: 'Gartner, Forrester, IDC, EDUCAUSE, and Jisc research reports evaluating system capabilities.' },
  { type: 'User Community Reports', weight: 'Secondary', icon: '👥', desc: 'Community forums, user groups, and practitioner networks including UCISA, EDUCAUSE, and vendor user groups.' },
  { type: 'Vendor Responses', weight: 'Tertiary', icon: '📨', desc: 'Vendor responses to capability questionnaires. Treated as supporting evidence only — never sole basis for a score.' },
];

const REVIEW_PROCESS = [
  { step: 1, title: 'Initial Scoring', desc: 'Capabilities are scored by FHE analysts based on vendor documentation, independent testing, and analyst research.' },
  { step: 2, title: 'Peer Review', desc: 'Initial scores are reviewed by a second analyst. Disagreements trigger evidence re-evaluation.' },
  { step: 3, title: 'Vendor Notification', desc: 'Vendors are notified of their scores before publication and given 30 days to submit evidence for any disputed scores.' },
  { step: 4, title: 'Appeals Process', desc: 'Vendors may submit written evidence. Scores are updated where evidence supports a change. The evidence is published alongside the updated score.' },
  { step: 5, title: 'Publication', desc: 'Scores published with version number and date. All score changes are tracked in the version history.' },
  { step: 6, title: 'Quarterly Review', desc: 'All scores reviewed quarterly. Major product releases trigger immediate re-evaluation of affected capabilities.' },
];

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: 'About HERM & the Platform',
    items: [
      { q: 'What is HERM v3.1 and who maintains it?', a: 'HERM (Higher Education Reference Model) v3.1 is a business architecture model maintained by UCISA with international partners EDUCAUSE (US), CAUDIT (Australasia), and EUNIS (Europe). It provides a standardised vocabulary for HE business capabilities.' },
      { q: 'How are the 165 capabilities chosen?', a: 'The 165 capabilities are defined by UCISA HERM v3.1 across 11 business capability families. FHE does not add or remove capabilities from the framework — we score all capabilities as defined.' },
      { q: 'How often are scores updated?', a: "Scores are reviewed quarterly as standard. Major product releases (e.g., Workday's bi-annual releases, SITS annual upgrades) trigger immediate re-evaluation of affected capability areas." },
      { q: 'How does SJMS v4 differ from commercial systems?', a: 'SJMS v4 is an internally-developed system at Future Horizons Education. Its scores reflect the completed HERM audit (84/130 SIS-relevant capabilities at 64.6%) as of Q1 2026. Scores will update as development progresses.' },
    ],
  },
  {
    title: 'Using the Dashboard',
    items: [
      { q: 'Does a higher HERM score mean a better system?', a: 'Not necessarily. A system covering 80% of 165 capabilities may be weaker than a focused system covering 50% — if those 50% are exactly what your institution needs. Always use the Capability Basket to weight scores against your specific requirements.' },
      { q: 'How do I weight capabilities for our procurement?', a: "Use the Capability Basket feature. Add the capabilities your institution needs, assign MoSCoW priorities (Must/Should/Could/Won't) and importance weights (1\u20135). The system calculates a weighted fit score for all 21 vendors." },
      { q: 'Can I export scores for procurement documents?', a: 'Yes. The Export page provides CSV exports of the full leaderboard, capability heatmap, and detailed system reports. The Capability Basket generates weighted shortlists you can export for ITT evaluation criteria.' },
      { q: 'Are cloud-native systems scored differently to on-premise?', a: 'No. The scoring assesses capability regardless of deployment model. A cloud system and on-premise system achieving the same functional outcome both score 100.' },
      { q: 'Can vendors dispute their scores?', a: 'Yes. Vendors are notified before publication and have 30 days to submit evidence via the Vendor Portal. Disputes are reviewed by two independent analysts. The final score and the nature of any dispute are both published.' },
    ],
  },
  {
    title: 'Scoring & Methodology',
    items: [
      { q: 'Why only three score points (0, 50, 100)?', a: 'A three-point scale reduces scoring subjectivity. In practice, the difference between "strong partial" and "moderate full" support is often opinion-dependent. Three clear thresholds — native, workaround-available, unavailable — produce more consistent and defensible scores.' },
      { q: 'What does "BC" stand for in capability codes?', a: '"BC" stands for Business Capability, following the HERM v3.1 notation. Codes are sequential but non-contiguous, reflecting the evolution of the framework across multiple HERM versions.' },
      { q: 'How is the Research family scored differently?', a: 'Research capabilities (BC050\u2013BC074) are assessed specifically for research management functionality. Pure SIS systems typically score 0 here; Research Information Systems (CRIS) are not included in this platform as they serve a distinct market.' },
      { q: 'Is the scoring framework proprietary?', a: 'The scoring data is proprietary to Future Horizons Education. The underlying HERM v3.1 framework is published by UCISA and freely available. Our scoring methodology is openly documented in this guide.' },
    ],
  },
  {
    title: 'Procurement & Compliance',
    items: [
      { q: 'Are scores global or UK-specific?', a: "Scores reflect the product as-delivered. Regional modules are noted \u2014 for example, SITS's HESA compliance (BC086) scores 100 for UK deployments but this reflects a UK-specific module, not global capability." },
      { q: 'What is the relationship between HERM and HESA Data Futures?', a: 'HERM v3.1 is a business capability model. HESA Data Futures is a reporting standard. Multiple HERM capabilities (BC011, BC016, BC033, etc.) have direct HESA Data Futures data implications. Our scoring notes where HESA-specific functionality is relevant.' },
    ],
  },
];

export function HowItWorks() {
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<Tab>('Scoring Model');

  return (
    <div>
      <Header title={t('howItWorks.title', 'How It Works')} subtitle={t('howItWorks.subtitle', 'Scoring methodology, evidence standards, and framework explanation')} />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${activeTab === tab ? 'bg-teal text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-teal/10 hover:text-teal-700 dark:hover:text-teal-300'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Scoring Model' && (
        <div className="space-y-6">
          <Card>
            <h2 className="font-heading font-bold text-xl text-gray-900 dark:text-white mb-2">{SCORING_CONTENT.title}</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">{SCORING_CONTENT.intro}</p>
            <div className="space-y-6">
              {SCORING_CONTENT.scores.map(s => (
                <div key={s.value} className="flex gap-4">
                  <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center ${s.color}`}>
                    <div className="text-2xl font-bold">{s.value}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">{s.description}</p>
                    <div className="space-y-1">
                      {s.examples.map((ex, i) => (
                        <p key={i} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                          {ex}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('howItWorks.scoreCalculation', 'Score Calculation')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Overall HERM coverage is calculated as:</p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
              <div>Coverage % = (Sum of all capability scores) / (Number of capabilities x 100) x 100</div>
              <div className="text-gray-400 mt-1">e.g., 8,500 / (165 x 100) x 100 = 51.5%</div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Family scores use the same formula applied only to capabilities within that family.</p>
          </Card>

          {/* Score Aggregation */}
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Score Aggregation</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Scores are aggregated at multiple levels to give a hierarchical view of system coverage.
            </p>
            <div className="space-y-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Family Score</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Average of all capability scores within a family.</p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 font-mono text-xs">
                  Family Score = Average(capability scores in family)
                </div>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Category Score</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Average of family scores within a category.</p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 font-mono text-xs">
                  Category Score = Average(family scores in category)
                </div>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Overall Score</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Sum of all capability scores divided by the maximum possible.</p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 font-mono text-xs">
                  Overall Score = (Sum of all capability scores) / (Number x 100) x 100
                </div>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Weighted Basket Score</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Weighted average using institution-defined importance weights from the Capability Basket.</p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 font-mono text-xs">
                  Weighted Basket = Sum(score x weight) / Sum(100 x weight) x 100
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Evidence Types' && (
        <div className="space-y-4">
          {EVIDENCE_TYPES.map(et => (
            <Card key={et.type}>
              <div className="flex gap-4">
                <div className="text-3xl">{et.icon}</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{et.type}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${et.weight === 'Primary' ? 'bg-blue-100 text-blue-800' : et.weight === 'Secondary' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'}`}>{et.weight}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{et.desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'Review Process' && (
        <div className="space-y-4">
          {REVIEW_PROCESS.map(step => (
            <Card key={step.step}>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-teal text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{step.step}</div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{step.desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'FAQ' && (
        <div className="space-y-8">
          {FAQ_CATEGORIES.map(cat => (
            <div key={cat.title}>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {cat.title}
              </h3>
              <div className="space-y-3">
                {cat.items.map((item, i) => (
                  <FaqAccordionItem key={i} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FaqAccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="cursor-pointer">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex justify-between items-start gap-4">
        <span className="font-medium text-gray-900 dark:text-white text-sm">{q}</span>
        <span className="text-gray-400 flex-shrink-0">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-3">{a}</p>}
    </Card>
  );
}
