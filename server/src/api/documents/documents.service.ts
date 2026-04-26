import prisma from '../../utils/prisma';
import { NotFoundError } from '../../utils/errors';
import { PRODUCT } from '../../lib/branding';
import type { GenerateDocumentInput, UpdateDocumentInput } from './documents.schema';

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  locked?: boolean;
}

// ── Template generators ───────────────────────────────────────────────────────

async function generateBusinessCase(input: GenerateDocumentInput, _date: string): Promise<DocumentSection[]> {
  let tcoSection = '_No TCO data linked. Add a TCO estimate ID to populate this section._';
  let valueSection = '_No value analysis linked. Add a value analysis ID to populate this section._';
  let basketSection = '_No requirements basket linked. Add a basket ID to populate this section._';

  if (input.tcoEstimateId) {
    const tco = await prisma.tcoEstimate.findUnique({
      where: { id: input.tcoEstimateId },
      include: { system: { select: { name: true, vendor: true } } },
    });
    if (tco) {
      tcoSection = `**System:** ${tco.system?.name ?? 'Not specified'}\n\n` +
        `**Horizon:** ${tco.horizonYears} years | **Institution Size:** ${tco.studentFte.toLocaleString()} students\n\n` +
        `| Cost Component | Annual (£) |\n|---|---|\n` +
        `| Licence | ${tco.licenceCostYear1.toLocaleString()} |\n` +
        `| Implementation (one-off) | ${tco.implementationCost.toLocaleString()} |\n` +
        `| Annual Run Rate | ${tco.annualRunRate.toLocaleString()} |\n` +
        `| **Total ${tco.horizonYears}yr TCO** | **${tco.totalTco.toLocaleString()}** |\n` +
        `| Per Student (annual) | ${tco.perStudentCost.toFixed(0)} |`;
    }
  }

  if (input.valueAnalysisId) {
    const va = await prisma.valueAnalysis.findUnique({
      where: { id: input.valueAnalysisId },
      include: { targetSystem: { select: { name: true } } },
    });
    if (va) {
      const roi = va.roi5Year;
      const npv = va.npv5Year;
      const months = va.paybackMonths;
      valueSection = `**Target System:** ${va.targetSystem?.name ?? 'Not specified'}\n\n` +
        `| Metric | Value |\n|---|---|\n` +
        `| Annual Benefits | £${va.totalAnnualBenefits.toLocaleString(undefined, { maximumFractionDigits: 0 })} |\n` +
        `| Annual Costs | £${va.totalAnnualCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })} |\n` +
        `| Net Annual Benefit | £${va.netAnnualBenefit.toLocaleString(undefined, { maximumFractionDigits: 0 })} |\n` +
        `| ROI (5-year) | ${roi.toFixed(1)}% |\n` +
        `| NPV (5-year, 3.5%) | £${npv.toLocaleString(undefined, { maximumFractionDigits: 0 })} |\n` +
        `| Payback Period | ${months > 0 ? `${months} months` : 'Not recovered in 5 years'} |`;
    }
  }

  if (input.basketId) {
    const basket = await prisma.capabilityBasket.findUnique({
      where: { id: input.basketId },
      include: { items: { include: { capability: { include: { domain: true } } } } },
    });
    if (basket && basket.items.length > 0) {
      const mustHaves = basket.items.filter((i) => i.priority === 'must');
      const shouldHaves = basket.items.filter((i) => i.priority === 'should');
      basketSection = `**Basket:** ${basket.name} (${basket.items.length} requirements)\n\n` +
        `**Must-Have Requirements (${mustHaves.length}):**\n` +
        mustHaves.slice(0, 10).map((i) => `- ${i.capability.code}: ${i.capability.name} _(${i.capability.domain?.name})_`).join('\n') +
        (mustHaves.length > 10 ? `\n_...and ${mustHaves.length - 10} more_` : '') +
        `\n\n**Should-Have Requirements (${shouldHaves.length}):**\n` +
        shouldHaves.slice(0, 5).map((i) => `- ${i.capability.code}: ${i.capability.name}`).join('\n');
    }
  }

  const inst = input.institutionName ?? input.metadata?.institution ?? 'the Institution';
  const systems = input.systemNames?.join(', ') ?? 'replacement system';

  return [
    {
      id: 'exec-summary',
      title: '1. Executive Summary',
      order: 1,
      content: `This business case presents the strategic and financial justification for procuring a new Student Information System (SIS) at ${inst}. The current SIS landscape has reached end-of-life and no longer meets the operational, regulatory, or strategic needs of the institution.\n\n${input.customIntroduction ?? `Following a thorough options appraisal and market engagement, this document recommends proceeding with the procurement of ${systems} through a competitive tender process compliant with the Public Contracts Regulations 2015.`}\n\n**Decision required:** Approval to proceed to OJEU notice / Find a Tender advertisement.`,
    },
    {
      id: 'strategic-context',
      title: '2. Strategic Context & Drivers',
      order: 2,
      content: `### 2.1 Institutional Strategy\n\nThis procurement directly supports the institution's Digital Strategy by replacing legacy infrastructure with a modern, cloud-native platform that supports student-centric service delivery.\n\n### 2.2 Drivers for Change\n\n- **Legacy system lifecycle:** Current SIS approaching end of vendor support\n- **Regulatory compliance:** HESA Data Futures, OfS conditions of registration, UKVI attendance monitoring\n- **Student experience:** Demand for self-service, mobile-first academic services\n- **Operational efficiency:** Manual workarounds and dual-keying due to lack of integration\n- **Data quality:** Fragmented data estate limiting management information capability\n\n### 2.3 Strategic Alignment\n\nThis investment aligns with:\n- UCISA HERM v3.1 capability framework\n- Office for Students B-conditions (access, quality, outcome)\n- HM Treasury Value for Money principles`,
    },
    {
      id: 'current-state',
      title: '3. Current State Analysis',
      order: 3,
      content: `### 3.1 Current System Landscape\n\nThe institution currently operates a fragmented system estate with multiple point-to-point integrations creating significant technical debt and operational risk.\n\n### 3.2 Pain Points\n\n- Manual data entry and re-keying between disconnected systems\n- Limited real-time reporting and management information\n- Poor student self-service capability\n- HESA data quality issues requiring manual remediation\n- High support and maintenance costs for ageing infrastructure\n\n### 3.3 Regulatory Exposure\n\nThe current estate creates risk across: HESA Data Futures compliance, UKVI attendance monitoring, GDPR data management obligations, and OfS outcome metrics reporting.`,
    },
    {
      id: 'options',
      title: '4. Options Appraisal',
      order: 4,
      content: `### 4.1 Options Considered\n\n| Option | Description | Recommendation |\n|--------|-------------|----------------|\n| Option 0 | Do nothing / maintain current system | **Rejected** — end of life, increasing risk |\n| Option 1 | Extend/enhance current system | **Rejected** — not cost-effective, vendor end-of-support |\n| Option 2 | Bespoke development | **Rejected** — high risk, high cost, no sector precedent |\n| Option 3 | Best-of-breed SIS procurement | **Recommended** — market-mature solutions available |\n\n### 4.2 Recommended Option\n\nOption 3 — competitive procurement of a best-of-breed SIS aligned to UCISA HERM v3.1. The HERM framework analysis shows the market offers several systems scoring >65% against the institution's prioritised capabilities.`,
    },
    {
      id: 'requirements',
      title: '5. Requirements Summary',
      order: 5,
      content: basketSection,
    },
    {
      id: 'financial-case',
      title: '6. Financial Case',
      order: 6,
      content: `### 6.1 Total Cost of Ownership\n\n${tcoSection}\n\n### 6.2 Benefits & Value Analysis\n\n${valueSection}\n\n### 6.3 Affordability\n\nThe investment falls within the institution's capital planning framework. Detailed year-by-year cashflow has been reviewed by the Director of Finance and is within approved budget envelope.`,
    },
    {
      id: 'risk',
      title: '7. Risk Assessment',
      order: 7,
      content: `### 7.1 Key Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|------|-----------|--------|------------|\n| Implementation delay | Medium | High | Phased delivery, milestone-based payments |\n| Data migration quality | Medium | High | Data quality audit pre-migration, rehearsal runs |\n| Staff adoption | Medium | Medium | Change management programme, superuser network |\n| Vendor financial stability | Low | High | Financial due diligence, escrow requirements in contract |\n| Integration complexity | Medium | Medium | API-first technical requirements, integration testing |\n| Academic year disruption | Low | High | Go-live window restricted to June-August |\n\n### 7.2 Risk Appetite\n\nThe institution's risk appetite for this programme is **low to medium**. Mitigation measures are embedded in the project governance structure.`,
    },
    {
      id: 'delivery',
      title: '8. Delivery Approach',
      order: 8,
      content: `### 8.1 Procurement Route\n\nOpen procedure under Public Contracts Regulations 2015 (PCR 2015), advertised on Find a Tender Service. Estimated contract value requires OJEU notification.\n\n### 8.2 Timeline\n\n| Phase | Activity | Duration |\n|-------|----------|----------|\n| 0 | Business case approval & market engagement | 2 months |\n| 1 | ITT publication and tender period | 6 weeks |\n| 2 | Evaluation and shortlisting | 6 weeks |\n| 3 | Demonstrations and BAFO | 4 weeks |\n| 4 | Contract award | 2 weeks |\n| 5 | Implementation | 12-18 months |\n| 6 | Go-live and parallel running | 3 months |\n\n### 8.3 Governance\n\n- SRO: Director of IT / Registrar\n- Project Board: IT, Registry, Finance, Academic representation\n- Reporting: Monthly to IT Committee, quarterly to governors`,
    },
    {
      id: 'recommendation',
      title: '9. Recommendation',
      order: 9,
      content: `${input.customRecommendation ?? `IT Committee / Governing Body is requested to:\n\n1. **Approve** this business case and the release of procurement budget\n2. **Authorise** commencement of the OJEU/Find a Tender procurement process\n3. **Note** the programme governance structure and escalation routes\n4. **Delegate** contract award authority to the Vice-Chancellor (up to contract value)\n\nThis investment represents a necessary and strategically aligned commitment that will deliver measurable improvements in operational efficiency, student experience, and regulatory compliance over the 5-year horizon.`}`,
    },
    {
      id: 'appendix-a',
      title: 'Appendix A: HERM Capability Alignment',
      order: 10,
      content: `The UCISA Higher Education Reference Model (HERM v3.1) provides 165 business capabilities across 11 families. The institution's prioritised requirements basket has been mapped to this framework and evaluated against the market.\n\nCapability basket reference: ${input.basketId ?? 'Not linked'}\n\nRefer to ${PRODUCT.name} for full capability scoring and vendor comparison tables.`,
    },
  ];
}

async function generateRfpItt(input: GenerateDocumentInput): Promise<DocumentSection[]> {
  const inst = input.institutionName ?? input.metadata?.institution ?? '[INSTITUTION NAME]';
  const ref = input.metadata?.reference ?? `[REF-${new Date().getFullYear()}]`;
  let requirementsSection = '_No requirements basket linked. Please connect a capability basket for detailed functional requirements._';

  if (input.basketId) {
    const basket = await prisma.capabilityBasket.findUnique({
      where: { id: input.basketId },
      include: { items: { include: { capability: { include: { domain: true } } }, orderBy: [{ priority: 'asc' }] } },
    });
    if (basket) {
      const grouped: Record<string, typeof basket.items> = {};
      for (const item of basket.items) {
        const key = item.capability.domain?.name ?? 'Other';
        grouped[key] = grouped[key] ?? [];
        grouped[key].push(item);
      }
      requirementsSection = Object.entries(grouped)
        .map(([family, items]) =>
          `**${family}**\n\n` +
          items.map((i) => `- **${i.capability.code}** ${i.capability.name} _(${i.priority.toUpperCase()})_`).join('\n')
        )
        .join('\n\n');
    }
  }

  return [
    {
      id: 'cover',
      title: '1. Invitation to Tender',
      order: 1,
      content: `**Reference:** ${ref}\n**Contracting Authority:** ${inst}\n**Subject:** Student Information System — Invitation to Tender\n**Procedure:** Open (PCR 2015 Regulation 27)\n**CPV Code:** 48440000-4 (Financial analysis and accounting software package)\n\n---\n\nThis Invitation to Tender (ITT) is issued by ${inst} ('the Contracting Authority') for the supply, implementation, and support of a Student Information System (SIS) in accordance with the Public Contracts Regulations 2015.\n\nTenderers should read this document in full and respond to all sections. Failure to respond to any mandatory question may result in disqualification.`,
    },
    {
      id: 'background',
      title: '2. Background & Context',
      order: 2,
      content: `${inst} is a UK higher education institution regulated by the Office for Students (OfS). The institution seeks to procure a best-of-breed Student Information System to replace its existing legacy platform.\n\n### 2.1 Institutional Profile\n\n- Student population: [INSERT FTE]\n- Staff: [INSERT FTE]\n- Academic structure: [INSERT FACULTIES/SCHOOLS]\n- Location: [INSERT CAMPUSES]\n\n### 2.2 Procurement Objectives\n\nThe procurement seeks a solution that:\n- Covers the UCISA HERM v3.1 core capabilities for Learning & Teaching\n- Supports HESA Data Futures compliance\n- Integrates with existing enterprise systems\n- Delivers measurable improvements in student and staff experience`,
    },
    {
      id: 'scope',
      title: '3. Scope of Contract',
      order: 3,
      content: `### 3.1 In Scope\n\n- Student record management (admissions through alumni)\n- Programme and module management\n- Assessment and progression management\n- HESA statutory returns (Data Futures)\n- UKVI attendance monitoring\n- Student self-service portal\n- Staff academic management interfaces\n- Reporting and management information\n- Integration with finance, HR, VLE, and CRM systems\n- Training, implementation, and go-live support\n- Ongoing maintenance and support (5-year initial term)\n\n### 3.2 Out of Scope\n\n- Finance/payroll system\n- Library management system\n- Email/collaboration platform\n- Physical access control`,
    },
    {
      id: 'requirements',
      title: '4. Functional Requirements',
      order: 4,
      content: `Requirements are categorised using the MoSCoW prioritisation method:\n- **MUST**: Mandatory — failure to meet disqualifies the tender\n- **SHOULD**: Important — scored highly in evaluation\n- **COULD**: Desirable — positive differentiator\n- **WON'T**: Out of scope for this procurement\n\nAll requirements are mapped to UCISA HERM v3.1 capability codes.\n\n---\n\n${requirementsSection}`,
    },
    {
      id: 'technical',
      title: '5. Technical Requirements',
      order: 5,
      content: `### 5.1 Non-Functional Requirements\n\n| Requirement | Standard |\n|-------------|----------|\n| Availability | 99.9% uptime during term time |\n| Performance | <3s page load, <200ms API response |\n| Security | ISO 27001 / Cyber Essentials Plus |\n| Data residency | UK/EEA data centres only |\n| GDPR | Article 28 Data Processing Agreement required |\n| Accessibility | WCAG 2.1 AA minimum |\n| API | REST/JSON, OpenAPI 3.0 documentation |\n| Integration | Standard protocols: REST, SFTP, SAML 2.0 SSO |\n| Data migration | Full historical data migration with validation |\n\n### 5.2 Infrastructure\n\nPreferred deployment: Cloud-native SaaS. On-premise and hybrid will be considered.\n\n### 5.3 Authentication\n\nMandatory: SAML 2.0 / OIDC integration with institutional identity provider. Support for MFA.`,
    },
    {
      id: 'evaluation',
      title: '6. Evaluation Criteria',
      order: 6,
      content: `### 6.1 Award Criteria\n\nContract will be awarded to the Most Economically Advantageous Tender (MEAT) using the following criteria:\n\n| Criterion | Weight |\n|-----------|--------|\n| Functional capability (HERM alignment) | 35% |\n| Technical architecture & integration | 20% |\n| Implementation approach & timeline | 15% |\n| Total cost of ownership (5 years) | 20% |\n| Supplier qualifications & references | 10% |\n\n### 6.2 Scoring\n\nFunctional requirements scored 0–4:\n- 4: Fully met by standard product\n- 3: Met with minor configuration\n- 2: Met with customisation (at cost)\n- 1: Met through workaround\n- 0: Not met\n\n### 6.3 Pass/Fail Gates\n\nAll MUST requirements must score ≥ 2.`,
    },
    {
      id: 'commercial',
      title: '7. Commercial Terms',
      order: 7,
      content: `### 7.1 Contract Structure\n\n- Initial term: 5 years with option to extend 2+2 years\n- Payment: Milestone-based implementation; annual SaaS licence thereafter\n- Break clause: After year 3 with 6 months' notice\n\n### 7.2 Pricing Requirements\n\nTenderers must provide:\n\n- Itemised implementation costs (professional services, travel, training)\n- Annual licence/SaaS costs for 1,000 / 5,000 / 10,000 / 20,000 students\n- Per-student pricing model where applicable\n- Year-on-year price escalation cap (recommended: CPI + 2%)\n- Exit costs and data portability provisions\n\n### 7.3 Key Contract Conditions\n\n- Data Processing Agreement (UK GDPR compliant)\n- Step-in rights\n- Service Level Agreement with financial remedies\n- Source code escrow for SaaS-hosted systems`,
    },
    {
      id: 'submission',
      title: '8. Submission Instructions',
      order: 8,
      content: `### 8.1 Tender Deadline\n\n[INSERT DATE] at 17:00 GMT via [INSERT PORTAL URL]\n\nLate submissions will not be accepted.\n\n### 8.2 Clarification Questions\n\nClarification questions must be submitted via [INSERT PORTAL] by [INSERT DATE - 10 DAYS BEFORE DEADLINE]. Responses will be published anonymously to all tenderers.\n\n### 8.3 Tender Documents Required\n\n1. Completed Response Schedule (Section 4 requirements matrix)\n2. Technical response (Section 5)\n3. Implementation plan and timeline\n4. Commercial response including itemised pricing\n5. Case studies from at least 2 UK higher education institutions\n6. Financial accounts (last 2 years)\n7. Insurance certificates\n8. Data Processing Agreement draft\n\n### 8.4 Standstill Period\n\nA minimum 10-day standstill period will apply before contract award per Regulation 87 PCR 2015.`,
    },
  ];
}

async function generateShortlistReport(input: GenerateDocumentInput): Promise<DocumentSection[]> {
  const inst = input.institutionName ?? input.metadata?.institution ?? '[INSTITUTION]';
  let shortlistSection = '_No procurement project linked._';
  const tcoComparison = '_No TCO data available._';

  if (input.projectId) {
    const project = await prisma.procurementProject.findUnique({
      where: { id: input.projectId },
      include: {
        shortlist: {
          include: { system: { select: { id: true, name: true, vendor: true, category: true, cloudNative: true } } },
          orderBy: { score: 'desc' },
        },
        workflow: { select: { currentStage: true } },
      },
    });
    if (project?.shortlist?.length) {
      shortlistSection = `**Project:** ${project.name}\n\n` +
        `| # | Vendor | System | Category | Cloud | Score | Status |\n|---|--------|--------|----------|-------|-------|--------|\n` +
        project.shortlist.map((e, i) =>
          `| ${i + 1} | ${e.system.vendor} | ${e.system.name} | ${e.system.category} | ${e.system.cloudNative ? 'Yes' : 'No'} | ${e.score?.toFixed(1) ?? '-'} | ${e.status} |`
        ).join('\n');
    }
  }

  return [
    {
      id: 'executive',
      title: '1. Evaluation Report — Executive Summary',
      order: 1,
      content: `**Prepared for:** ${inst} IT Committee\n**Subject:** SIS Shortlist Evaluation Report\n**Date:** ${input.metadata?.date ?? new Date().toLocaleDateString('en-GB')}\n\nThis report summarises the evaluation of shortlisted Student Information System vendors against the institution's requirements and UCISA HERM v3.1 capability framework.\n\nFollowing a rigorous evaluation process, the Evaluation Panel recommends proceeding with [PREFERRED VENDOR] to Preferred Supplier status.`,
    },
    {
      id: 'shortlist',
      title: '2. Shortlisted Vendors',
      order: 2,
      content: shortlistSection,
    },
    {
      id: 'evaluation-summary',
      title: '3. Evaluation Summary',
      order: 3,
      content: `### 3.1 Evaluation Process\n\n- Written response evaluation against ITT criteria\n- Product demonstration (4 hours per vendor)\n- Reference site visits (2 per vendor)\n- BAFO (Best and Final Offer) round\n\n### 3.2 HERM Capability Scores\n\nAll vendors were scored against the institution's prioritised HERM capability basket. Scores represent percentage coverage of must-have and should-have requirements.\n\n_[Refer to ${PRODUCT.name} export for detailed capability matrix]_\n\n### 3.3 Financial Comparison\n\n${tcoComparison}`,
    },
    {
      id: 'recommendation',
      title: '4. Recommendation',
      order: 4,
      content: `### 4.1 Recommended Vendor\n\n**Recommended:** [VENDOR NAME — populate from evaluation]\n\n**Rationale:**\n\n- Highest overall HERM capability score (XX% against must-have requirements)\n- Best-value TCO over 5 years\n- Strong UK HE reference sites\n- Credible implementation methodology\n- Contractually committed roadmap for UK regulatory compliance\n\n### 4.2 Risk Summary\n\n[Summarise key risks for preferred vendor and proposed mitigations]\n\n### 4.3 Next Steps\n\n1. IT Committee approval to proceed to Preferred Supplier\n2. Contract negotiations\n3. Legal review of Data Processing Agreement\n4. Implementation planning workshop\n5. Standstill notification to unsuccessful tenderers`,
    },
  ];
}

async function generateRequirementsSpec(input: GenerateDocumentInput): Promise<DocumentSection[]> {
  const inst = input.institutionName ?? input.metadata?.institution ?? '[INSTITUTION]';
  let requirementsContent = '_No capability basket linked. Connect a basket to generate detailed requirements._';
  let domainSummary = '';

  if (input.basketId) {
    const basket = await prisma.capabilityBasket.findUnique({
      where: { id: input.basketId },
      include: {
        items: {
          include: { capability: { include: { domain: true } } },
          orderBy: [{ priority: 'asc' }, { capability: { code: 'asc' } }],
        },
      },
    });
    if (basket) {
      const byDomain: Record<string, typeof basket.items> = {};
      for (const item of basket.items) {
        const k = item.capability.domain?.name ?? 'Other';
        byDomain[k] = byDomain[k] ?? [];
        byDomain[k].push(item);
      }

      const mustCount = basket.items.filter((i) => i.priority === 'must').length;
      const shouldCount = basket.items.filter((i) => i.priority === 'should').length;
      const couldCount = basket.items.filter((i) => i.priority === 'could').length;

      domainSummary = `**Basket:** ${basket.name}\n**Total Requirements:** ${basket.items.length} (${mustCount} MUST, ${shouldCount} SHOULD, ${couldCount} COULD)\n\n`;

      requirementsContent =
        domainSummary +
        Object.entries(byDomain)
          .map(([family, items]) => {
            const rows = items.map((i) =>
              `| ${i.capability.code} | ${i.capability.name} | ${i.priority.toUpperCase()} | ${i.weight} | ${i.notes ?? ''} |`
            ).join('\n');
            return `### ${family}\n\n| Code | Requirement | Priority | Weight | Notes |\n|------|-------------|----------|--------|-------|\n${rows}`;
          })
          .join('\n\n');
    }
  }

  return [
    {
      id: 'introduction',
      title: '1. Introduction',
      order: 1,
      content: `**Institution:** ${inst}\n**Document Type:** Functional Requirements Specification\n**Framework:** UCISA HERM v3.1\n**Date:** ${input.metadata?.date ?? new Date().toLocaleDateString('en-GB')}\n\nThis Requirements Specification defines the functional and capability requirements for a new Student Information System (SIS) at ${inst}. Requirements are mapped to the UCISA Higher Education Reference Model v3.1 (165 business capabilities across 11 families).\n\nThis document should be used:\n- As the basis for ITT functional requirements (Section 4)\n- As the evaluation matrix for vendor responses\n- As acceptance criteria for implementation\n- As the baseline for post-implementation review`,
    },
    {
      id: 'herm-context',
      title: '2. HERM v3.1 Context',
      order: 2,
      content: `The UCISA Higher Education Reference Model (HERM) v3.1 provides a comprehensive framework of 165 business capabilities organised into 11 families:\n\n| Family | Capabilities | Type |\n|--------|-------------|------|\n| Learning & Teaching | 41 | Core |\n| Research | 16 | Core |\n| Strategy & Governance | 17 | Enabling |\n| Financial Management | 18 | Enabling |\n| HR Management | 12 | Enabling |\n| ICT Management | 12 | Enabling |\n| Facilities & Estate | 10 | Enabling |\n| Engagement & Communication | 14 | Enabling |\n| Information Management | 10 | Enabling |\n| Legal & Compliance | 8 | Enabling |\n| Supporting Services | 7 | Enabling |\n\nRequirements are scored 0 (not supported), 50 (partial), or 100 (full) against each capability.`,
    },
    {
      id: 'requirements',
      title: '3. Prioritised Requirements',
      order: 3,
      content: requirementsContent,
    },
    {
      id: 'nonfunctional',
      title: '4. Non-Functional Requirements',
      order: 4,
      content: `### 4.1 Performance\n\n| Requirement | Standard | Priority |\n|-------------|----------|----------|\n| Page load time | <3 seconds (95th percentile) | MUST |\n| API response time | <200ms for reads | MUST |\n| Report generation | <30 seconds | SHOULD |\n| Concurrent users | 500+ simultaneous | MUST |\n| Batch processing | Overnight HESA extract <4 hours | MUST |\n\n### 4.2 Security & Compliance\n\n| Requirement | Standard |\n|-------------|----------|\n| Authentication | SAML 2.0 / OIDC SSO |\n| Authorisation | Role-based access control |\n| Data encryption | AES-256 at rest, TLS 1.3 in transit |\n| GDPR | Article 28 DPA, data residency UK/EEA |\n| Certifications | ISO 27001 or equivalent |\n| Penetration testing | Annual, results shared |\n| Cyber Essentials | Plus certification |\n\n### 4.3 Availability & Support\n\n| Requirement | Standard |\n|-------------|----------|\n| Uptime | 99.9% during term time (Mon-Fri 07:00-22:00) |\n| Planned maintenance | Weekends/vacations only, 5 days notice |\n| Incident response (P1) | <4 hours |\n| Support hours | 08:00-18:00 GMT, extended during enrolment |\n\n### 4.4 Integration\n\nMandatory integration points:\n- Finance system (student fees, payments)\n- HR/Payroll (staff data)\n- VLE/LMS (enrolment sync)\n- CRM/Admissions\n- Library management system\n- Single Sign-On (SAML/OIDC)\n- HESA (statutory return extract)\n- UCAS (admissions feed)`,
    },
    {
      id: 'evaluation-matrix',
      title: '5. Evaluation Scoring Matrix',
      order: 5,
      content: `Vendor responses should be scored against each requirement using the following scale:\n\n| Score | Meaning |\n|-------|---------|\n| 4 | Fully met by standard product, no customisation required |\n| 3 | Substantially met with minor configuration |\n| 2 | Met with significant customisation (cost + risk noted) |\n| 1 | Met through third-party integration or workaround |\n| 0 | Not met |\n\n**Weighted score** = Requirement score × Weight × Priority multiplier\n\nPriority multipliers: MUST = 3, SHOULD = 2, COULD = 1\n\nA MUST requirement scoring 0 is grounds for disqualification.`,
    },
  ];
}

async function generateExecutiveSummary(input: GenerateDocumentInput): Promise<DocumentSection[]> {
  const inst = input.institutionName ?? input.metadata?.institution ?? '[INSTITUTION]';
  return [
    {
      id: 'summary',
      title: 'Executive Summary',
      order: 1,
      content: `**Prepared for:** ${inst} Senior Leadership Team\n**Date:** ${input.metadata?.date ?? new Date().toLocaleDateString('en-GB')}\n\n## SIS Procurement Programme — Executive Summary\n\n${inst} is undertaking the replacement of its Student Information System, a mission-critical platform supporting every stage of the student lifecycle from admissions through to graduation.\n\n### Why Now\n\nThe current SIS is approaching end-of-vendor-life, creating increasing risk to HESA Data Futures compliance, OfS regulatory obligations, and student experience expectations.\n\n### What We're Buying\n\nA modern, cloud-native Student Information System covering the full UCISA HERM v3.1 Learning & Teaching capability set, with integration across finance, HR, VLE, and CRM platforms.\n\n### Investment Summary\n\n${input.tcoEstimateId ? '_[Linked TCO estimate — see financial case]_' : 'Total investment: [INSERT FROM TCO CALCULATOR]'}\n\n### Expected Outcomes\n\n${input.valueAnalysisId ? '_[Linked value analysis — see benefits case]_' : '- Admin efficiency gains across registry and student services\n- Improved HESA data quality reducing resubmission risk\n- Enhanced student self-service capability\n- Platform for digital transformation'}\n\n### Timeline\n\n- Procurement: [START DATE] to [AWARD DATE]\n- Implementation: [START] to [GO-LIVE]\n- Steady state: [DATE + 6 months]\n\n### Recommendation\n\n${input.customRecommendation ?? 'Senior Leadership is asked to endorse this programme and authorise progression to OJEU procurement.'}`,
    },
  ];
}

// ── Service class ─────────────────────────────────────────────────────────────

export class DocumentsService {
  async generate(input: GenerateDocumentInput) {
    const date = input.metadata?.date ?? new Date().toLocaleDateString('en-GB');
    let sections: DocumentSection[] = [];

    switch (input.type) {
      case 'BUSINESS_CASE':
        sections = await generateBusinessCase(input, date);
        break;
      case 'RFP_ITT':
        sections = await generateRfpItt(input);
        break;
      case 'SHORTLIST_REPORT':
        sections = await generateShortlistReport(input);
        break;
      case 'REQUIREMENTS_SPEC':
        sections = await generateRequirementsSpec(input);
        break;
      case 'EXECUTIVE_SUMMARY':
        sections = await generateExecutiveSummary(input);
        break;
    }

    const wordCount = sections.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    return { sections, wordCount };
  }

  async saveDocument(input: GenerateDocumentInput) {
    const { sections, wordCount } = await this.generate(input);
    return prisma.generatedDocument.create({
      data: {
        title: input.title,
        type: input.type,
        institutionId: input.institutionId ?? null,
        projectId: input.projectId ?? null,
        basketId: input.basketId ?? null,
        tcoEstimateId: input.tcoEstimateId ?? null,
        valueAnalysisId: input.valueAnalysisId ?? null,
        sections: sections as unknown as import('@prisma/client').Prisma.InputJsonValue,
        metadata: (input.metadata ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
        status: 'DRAFT',
        wordCount,
        createdById: input.institutionId ?? 'anonymous',
      },
    });
  }

  // ── Tenant-scoped reads/writes ─────────────────────────────────────────────
  // Every list/get/update/delete must be scoped to the caller's institutionId
  // so a tenant cannot read or mutate another tenant's persisted documents by
  // id-guessing. Wrong-owner ids surface as 404 (NotFoundError), not 403 — we
  // do not confirm existence to other tenants.

  async listDocuments(institutionId: string) {
    return prisma.generatedDocument.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getDocument(id: string, institutionId: string) {
    const doc = await prisma.generatedDocument.findFirst({ where: { id, institutionId } });
    if (!doc) throw new NotFoundError(`Document not found: ${id}`);
    return doc;
  }

  async updateDocument(id: string, institutionId: string, data: UpdateDocumentInput) {
    const existing = await prisma.generatedDocument.findFirst({ where: { id, institutionId } });
    if (!existing) throw new NotFoundError(`Document not found: ${id}`);

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.sections) {
      updateData.sections = data.sections;
      updateData.wordCount = data.sections.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    }
    if (data.metadata) updateData.metadata = data.metadata;
    if (data.status) updateData.status = data.status;

    return prisma.generatedDocument.update({ where: { id }, data: updateData });
  }

  async deleteDocument(id: string, institutionId: string) {
    // updateMany/deleteMany takes a non-unique where, so we can scope by both
    // id and institutionId in one round-trip. count=0 → wrong owner → 404.
    const result = await prisma.generatedDocument.deleteMany({ where: { id, institutionId } });
    if (result.count === 0) throw new NotFoundError(`Document not found: ${id}`);
    return result;
  }
}
