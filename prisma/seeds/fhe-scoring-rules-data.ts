// server/src/data/fhe-scoring-rules.ts
// Deterministic scoring engine for the FHE Capability Framework.
//
// Rules are applied against VendorSystem + VendorProfile metadata (NOT any HERM data).
// The resolved score is always one of {0, 50, 100} to match the three-tier model used
// throughout the HERM platform (None / Partial / Full).
//
// Resolution order at seed time:
//   1. Manual override (see fhe-manual-scores.ts) — wins if present
//   2. Rule in this file — applied if no manual override
//   3. Default 0 — applied if neither is available

import type { VendorSystem, VendorProfile } from '@prisma/client';

export type ScoreValue = 0 | 50 | 100;

export interface ScoringRule {
  capabilityCode: string; // e.g., 'FHE-ET-001'
  rule: (system: VendorSystem, profile: VendorProfile | null) => ScoreValue;
  rationale: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Case-insensitive partial-match: true if ANY needle appears in any array item. */
export function hasAny(arr: string[] | undefined | null, needles: string[]): boolean {
  if (!arr || arr.length === 0) return false;
  return needles.some((n) => arr.some((a) => a.toLowerCase().includes(n.toLowerCase())));
}

/** Case-insensitive partial-match: true only if ALL needles appear somewhere in the array. */
export function hasAll(arr: string[] | undefined | null, needles: string[]): boolean {
  if (!arr || arr.length === 0) return false;
  return needles.every((n) => arr.some((a) => a.toLowerCase().includes(n.toLowerCase())));
}

/** Count how many needles appear in the array (partial, case-insensitive). */
export function countMatches(arr: string[] | undefined | null, needles: string[]): number {
  if (!arr || arr.length === 0) return 0;
  return needles.reduce(
    (acc, n) => acc + (arr.some((a) => a.toLowerCase().includes(n.toLowerCase())) ? 1 : 0),
    0,
  );
}

/** True if the system category equals any of the supplied categories (case-insensitive). */
export function isCategory(system: VendorSystem, cats: string[]): boolean {
  return cats.some((c) => c.toLowerCase() === system.category.toLowerCase());
}

/** Cloud-native rule helper — used by several ET rules. */
function cloudBonus(system: VendorSystem, profile: VendorProfile | null): ScoreValue {
  if (system.cloudNative && hasAny(profile?.deploymentModel, ['Cloud'])) return 100;
  if (system.cloudNative || hasAny(profile?.deploymentModel, ['Cloud'])) return 50;
  return 0;
}

// ─── Rule Catalogue ─────────────────────────────────────────────────────────

export const FHE_SCORING_RULES: ScoringRule[] = [
  // ══════════════════════════════════════════════════════════════════════
  // ET — Enterprise Technology (15 capabilities) — fully rule-driven
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-ET-001', // Identity Federation & Single Sign-On
    rule: (_sys, p) => {
      if (hasAll(p?.integrationProtocols, ['SAML', 'OIDC'])) return 100;
      if (hasAny(p?.integrationProtocols, ['SAML', 'OIDC'])) return 50;
      return 0;
    },
    rationale: 'Scored from identity federation protocol support (SAML 2.0 and OIDC).',
  },
  {
    capabilityCode: 'FHE-ET-002', // API Gateway & Rate Governance
    rule: (_sys, p) => {
      const count = countMatches(p?.apiStandards, ['REST', 'GraphQL', 'SOAP', 'OData']);
      if (count >= 3) return 100;
      if (count >= 1) return 50;
      return 0;
    },
    rationale: 'Scored from breadth of published API standards (REST/GraphQL/SOAP/OData).',
  },
  {
    capabilityCode: 'FHE-ET-003', // Service Catalogue & Request Fulfilment
    rule: (sys, p) => {
      // Any vendor publishing formal service catalogue scores, cloud-native more so.
      if (sys.cloudNative && hasAny(p?.apiStandards, ['REST'])) return 50;
      return 0;
    },
    rationale: 'Cloud-native vendors with REST APIs typically ship a service catalogue interface.',
  },
  {
    capabilityCode: 'FHE-ET-004', // Cloud Infrastructure Orchestration
    rule: cloudBonus,
    rationale: 'Scored from cloudNative flag and deployment-model mention of Cloud.',
  },
  {
    capabilityCode: 'FHE-ET-005', // Disaster Recovery & Business Continuity
    rule: (_sys, p) => {
      if (hasAny(p?.certifications, ['ISO 27001', 'SOC 2', 'FedRAMP'])) return 100;
      if (hasAny(p?.certifications, ['Cyber Essentials', 'GDPR'])) return 50;
      return 0;
    },
    rationale: 'Certifications (ISO 27001, SOC 2, FedRAMP) require demonstrable DR/BC controls.',
  },
  {
    capabilityCode: 'FHE-ET-006', // Integration Hub & Event Bus
    rule: (_sys, p) => {
      if (hasAny(p?.apiStandards, ['Webhook', 'Kafka', 'Event', 'Bus', 'Integration'])) return 100;
      if (hasAny(p?.integrationProtocols, ['Integration Cloud', 'Integration Hub', 'MuleSoft'])) {
        return 100;
      }
      if (hasAny(p?.apiStandards, ['REST', 'SOAP'])) return 50;
      return 0;
    },
    rationale: 'Scored from integration-platform mentions or webhook/bus capability.',
  },
  {
    capabilityCode: 'FHE-ET-007', // Endpoint & Mobile Device Governance
    rule: (sys, p) => {
      // Mobile-first vendors and cloud-native vendors with SCIM support get credit.
      if (hasAny(p?.integrationProtocols, ['SCIM'])) return 50;
      if (sys.category.toLowerCase() === 'crm' || /campus|mobile/i.test(sys.name)) return 50;
      return 0;
    },
    rationale: 'SCIM protocol and mobile-platform systems indicate endpoint governance features.',
  },
  {
    capabilityCode: 'FHE-ET-008', // Cyber Threat Detection & Response
    rule: (_sys, p) => {
      const certs = p?.certifications ?? [];
      const count = countMatches(certs, ['SOC 2', 'ISO 27001', 'FedRAMP', 'Cyber Essentials']);
      if (count >= 3) return 100;
      if (count >= 1) return 50;
      return 0;
    },
    rationale: 'Multi-certification security posture implies SIEM/SOC capability.',
  },
  {
    capabilityCode: 'FHE-ET-009', // Digital Certificate & Secret Rotation
    rule: (sys, p) => {
      if (sys.cloudNative && hasAny(p?.certifications, ['SOC 2', 'ISO 27001'])) return 100;
      if (sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'Cloud-native platforms automate TLS renewal; certifications confirm secret hygiene.',
  },
  {
    capabilityCode: 'FHE-ET-010', // Network & Campus Connectivity Fabric
    rule: (_sys, _p) => 0,
    rationale: 'Campus network fabric is typically outside vendor product scope — default 0.',
  },
  {
    capabilityCode: 'FHE-ET-011', // IT Financial & Licence Optimisation
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'HCM']) && sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'Cloud SIS/HCM platforms expose licence-utilisation dashboards.',
  },
  {
    capabilityCode: 'FHE-ET-012', // Change & Release Governance
    rule: (sys, p) => {
      if (sys.cloudNative && hasAny(p?.certifications, ['ISO 27001', 'SOC 2'])) return 100;
      if (hasAny(p?.certifications, ['ISO 27001', 'SOC 2'])) return 50;
      return 0;
    },
    rationale: 'ISO 27001/SOC 2 mandate documented change-control processes.',
  },
  {
    capabilityCode: 'FHE-ET-013', // Observability & Service Health Monitoring
    rule: (sys, p) => {
      if (sys.cloudNative && hasAny(p?.apiStandards, ['REST', 'GraphQL'])) return 100;
      if (sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'Cloud-native platforms ship observability dashboards and status pages.',
  },
  {
    capabilityCode: 'FHE-ET-014', // Data Sovereignty & Residency Control
    rule: (sys, p) => {
      const regions = sys.regions ?? [];
      if (regions.length >= 3) return 100;
      if (regions.length >= 1 && hasAny(p?.certifications, ['GDPR'])) return 100;
      if (regions.length >= 1) return 50;
      return 0;
    },
    rationale: 'Multi-region availability plus GDPR certification indicates data-residency control.',
  },
  {
    capabilityCode: 'FHE-ET-015', // Vendor & Contract Lifecycle Oversight
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'HCM'])) return 50;
      return 0;
    },
    rationale: 'SIS and HCM suites include contract-management modules for vendor oversight.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // GR — Governance Risk & Compliance (14 capabilities)
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-GR-001', // Policy Lifecycle Stewardship
    rule: (_sys, p) => {
      if (hasAny(p?.certifications, ['ISO 27001'])) return 50;
      return 0;
    },
    rationale: 'ISO 27001 implies a documented policy management regime.',
  },
  {
    capabilityCode: 'FHE-GR-002', // Regulatory Change Radar
    rule: (sys, _p) => {
      if (/HESA|UK/i.test(sys.description ?? '') || sys.regions.includes('UK')) return 50;
      return 0;
    },
    rationale: 'UK-focused vendors monitor OfS/HESA regulatory changes.',
  },
  {
    capabilityCode: 'FHE-GR-003', // Internal Audit Scheduling & Tracking
    rule: (_sys, p) => {
      const count = countMatches(p?.certifications, ['SOC 1', 'SOC 2', 'ISO 27001']);
      if (count >= 2) return 100;
      if (count >= 1) return 50;
      return 0;
    },
    rationale: 'Multiple audit certifications evidence mature audit tracking.',
  },
  {
    capabilityCode: 'FHE-GR-004', // Enterprise Risk Register
    rule: (_sys, p) => {
      if (hasAny(p?.certifications, ['ISO 27001'])) return 50;
      return 0;
    },
    rationale: 'ISO 27001 Annex A requires risk assessment and register.',
  },
  {
    capabilityCode: 'FHE-GR-005', // Compliance Evidence Vault
    rule: (_sys, p) => {
      const count = countMatches(p?.certifications, [
        'SOC 2',
        'ISO 27001',
        'FedRAMP',
        'GDPR',
        'FERPA',
      ]);
      if (count >= 4) return 100;
      if (count >= 2) return 50;
      return 0;
    },
    rationale: 'Breadth of certifications demonstrates evidence-vault sophistication.',
  },
  {
    capabilityCode: 'FHE-GR-006', // Data Protection Impact Orchestration
    rule: (_sys, p) => {
      if (hasAny(p?.certifications, ['GDPR'])) return 100;
      if (hasAny(p?.certifications, ['ISO 27001', 'SOC 2'])) return 50;
      return 0;
    },
    rationale: 'GDPR certification requires formal DPIA workflows.',
  },
  {
    capabilityCode: 'FHE-GR-007', // Freedom of Information Request Handler
    rule: (sys, _p) => {
      if (sys.regions.includes('UK')) return 50;
      return 0;
    },
    rationale: 'UK-deployed systems typically support FOI/SAR workflows.',
  },
  {
    capabilityCode: 'FHE-GR-008', // Incident & Breach Response Coordinator
    rule: (_sys, p) => {
      if (hasAny(p?.certifications, ['SOC 2', 'ISO 27001', 'FedRAMP'])) return 100;
      if (hasAny(p?.certifications, ['Cyber Essentials'])) return 50;
      return 0;
    },
    rationale: 'SOC 2 / ISO 27001 mandate documented incident-response playbooks.',
  },
  {
    capabilityCode: 'FHE-GR-009', // Committee & Governance Meeting Engine
    rule: (_sys, _p) => 0,
    rationale: 'Committee/meeting management is rarely core to SIS/LMS/CRM vendors.',
  },
  {
    capabilityCode: 'FHE-GR-010', // Whistleblowing & Disclosure Channel
    rule: (_sys, _p) => 0,
    rationale: 'Whistleblowing portals are specialist products, not in scope for most vendors.',
  },
  {
    capabilityCode: 'FHE-GR-011', // Insurance & Indemnity Register
    rule: (_sys, _p) => 0,
    rationale: 'Insurance registers are normally finance-module features — default 0.',
  },
  {
    capabilityCode: 'FHE-GR-012', // Regulatory Return Compliance Tracker
    rule: (sys, p) => {
      if (hasAny(p?.apiStandards, ['HESA', 'Data Futures'])) return 100;
      if (sys.regions.includes('UK') && isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'HESA Data Futures declaration in API standards indicates return-tracking.',
  },
  {
    capabilityCode: 'FHE-GR-013', // Modern Slavery & Due-Diligence Screening
    rule: (_sys, _p) => 0,
    rationale: 'Supplier due-diligence screening is not a core SIS/LMS capability.',
  },
  {
    capabilityCode: 'FHE-GR-014', // Equality Impact Assessment Workflow
    rule: (sys, _p) => {
      if (sys.regions.includes('UK')) return 50;
      return 0;
    },
    rationale: 'UK public-sector deployments require EIA workflows.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // DL — Digital Learning Infrastructure (15 capabilities)
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-DL-001', // Virtual Learning Environment Provisioning
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 100;
      return 0;
    },
    rationale: 'LMS is the dictionary definition of a VLE.',
  },
  {
    capabilityCode: 'FHE-DL-002', // Digital Content Authoring Pipeline
    rule: (sys, p) => {
      if (isCategory(sys, ['LMS']) && hasAny(p?.apiStandards, ['SCORM', 'xAPI', 'QTI'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms with SCORM/xAPI/QTI support provide content authoring pipelines.',
  },
  {
    capabilityCode: 'FHE-DL-003', // Learner Analytics Instrumentation
    rule: (sys, p) => {
      if (isCategory(sys, ['LMS']) && hasAny(p?.apiStandards, ['xAPI'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      if (isCategory(sys, ['SIS']) && sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'LMS platforms with xAPI support deliver learner-analytics instrumentation.',
  },
  {
    capabilityCode: 'FHE-DL-004', // Assessment Engine Orchestration
    rule: (sys, p) => {
      if (isCategory(sys, ['LMS']) && hasAny(p?.apiStandards, ['QTI'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'QTI-enabled LMS platforms provide assessment orchestration.',
  },
  {
    capabilityCode: 'FHE-DL-005', // Academic Integrity Tooling
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms bundle or integrate plagiarism tooling.',
  },
  {
    capabilityCode: 'FHE-DL-006', // Adaptive Pathway Configuration
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS']) && /brightspace|canvas|aula/i.test(sys.name)) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'Certain LMS platforms explicitly market adaptive learning engines.',
  },
  {
    capabilityCode: 'FHE-DL-007', // Micro-credential Issuance Platform
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms commonly issue badges via add-ons.',
  },
  {
    capabilityCode: 'FHE-DL-008', // Lecture Capture & Media Distribution
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms integrate lecture-capture plug-ins as standard.',
  },
  {
    capabilityCode: 'FHE-DL-009', // Remote Proctoring Fabric
    rule: (_sys, _p) => 0,
    rationale: 'Remote proctoring is a specialist third-party category — default 0.',
  },
  {
    capabilityCode: 'FHE-DL-010', // Collaborative Workspace Enablement
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 100;
      return 0;
    },
    rationale: 'Discussion boards and group spaces are core LMS features.',
  },
  {
    capabilityCode: 'FHE-DL-011', // Accessibility Compliance Engine
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS']) && /brightspace/i.test(sys.name)) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'Brightspace leads LMS accessibility benchmarks; others partial.',
  },
  {
    capabilityCode: 'FHE-DL-012', // LTI & EdTech Connector Hub
    rule: (sys, p) => {
      if (isCategory(sys, ['LMS']) && hasAny(p?.apiStandards, ['LTI 1.3', 'LTI Advantage'])) return 100;
      if (hasAny(p?.apiStandards, ['LTI 1.3', 'LTI Advantage'])) return 50;
      return 0;
    },
    rationale: 'LTI 1.3 / Advantage support establishes the connector hub capability.',
  },
  {
    capabilityCode: 'FHE-DL-013', // Simulation & Virtual Lab Hosting
    rule: (_sys, _p) => 0,
    rationale: 'Virtual labs are specialist infrastructure — default 0.',
  },
  {
    capabilityCode: 'FHE-DL-014', // Competency Mapping & Skills Tagging
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms tag learning outcomes and competencies.',
  },
  {
    capabilityCode: 'FHE-DL-015', // E-Portfolio & Evidence Collection
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'LMS platforms ship or integrate e-portfolio modules.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // II — Institutional Intelligence (13 capabilities)
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-II-001', // Operational Dashboard Framework
    rule: (sys, p) => {
      if (sys.cloudNative && hasAny(p?.apiStandards, ['OData', 'GraphQL'])) return 100;
      if (sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'Cloud-native platforms with OData/GraphQL expose dashboard-ready feeds.',
  },
  {
    capabilityCode: 'FHE-II-002', // Predictive Modelling Engine
    rule: (sys, _p) => {
      if (sys.cloudNative && isCategory(sys, ['SIS', 'CRM', 'HCM'])) return 50;
      return 0;
    },
    rationale: 'Cloud SIS/CRM/HCM suites ship predictive modules; legacy systems do not.',
  },
  {
    capabilityCode: 'FHE-II-003', // Enterprise Data Warehouse Architecture
    rule: (sys, p) => {
      if (hasAny(p?.apiStandards, ['OData'])) return 100;
      if (sys.cloudNative && hasAny(p?.apiStandards, ['REST'])) return 50;
      return 0;
    },
    rationale: 'OData mention indicates EDW-grade feeds; REST alone is partial.',
  },
  {
    capabilityCode: 'FHE-II-004', // Statutory Return Pipeline
    rule: (sys, p) => {
      if (hasAny(p?.apiStandards, ['HESA', 'Data Futures'])) return 100;
      if (sys.regions.includes('UK') && isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'HESA Data Futures native support scores full; UK SIS partial.',
  },
  {
    capabilityCode: 'FHE-II-005', // Data Quality Assurance Framework
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'HCM'])) return 50;
      return 0;
    },
    rationale: 'SIS/HCM platforms embed data validation rules.',
  },
  {
    capabilityCode: 'FHE-II-006', // Self-service Reporting Platform
    rule: (sys, p) => {
      if (hasAny(p?.apiStandards, ['OData', 'GraphQL'])) return 100;
      if (sys.cloudNative) return 50;
      return 0;
    },
    rationale: 'OData/GraphQL support implies self-service report builder.',
  },
  {
    capabilityCode: 'FHE-II-007', // Benchmarking & Sector Comparison
    rule: (_sys, _p) => 0,
    rationale: 'Sector benchmarking is rarely native to vendor products — default 0.',
  },
  {
    capabilityCode: 'FHE-II-008', // Survey & Feedback Aggregation
    rule: (sys, _p) => {
      if (isCategory(sys, ['LMS', 'CRM'])) return 50;
      return 0;
    },
    rationale: 'LMS and CRM platforms include survey/feedback modules.',
  },
  {
    capabilityCode: 'FHE-II-009', // Data Catalogue & Lineage Registry
    rule: (_sys, _p) => 0,
    rationale: 'Data catalogue and lineage are specialist products — default 0.',
  },
  {
    capabilityCode: 'FHE-II-010', // Regulatory Metric Computation
    rule: (sys, p) => {
      if (sys.regions.includes('UK') && hasAny(p?.apiStandards, ['HESA', 'Data Futures'])) {
        return 100;
      }
      if (sys.regions.includes('UK') && isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'UK SIS with HESA support compute TEF/OfS metrics.',
  },
  {
    capabilityCode: 'FHE-II-011', // Cost-attribution Modelling
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'HCM'])) return 50;
      return 0;
    },
    rationale: 'SIS/HCM finance integration supports programme-level costing.',
  },
  {
    capabilityCode: 'FHE-II-012', // Geospatial & Demographic Analytics
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM platforms bundle demographic analytics for recruitment.',
  },
  {
    capabilityCode: 'FHE-II-013', // Data Ethics Review Process
    rule: (_sys, _p) => 0,
    rationale: 'Data ethics governance workflows are not typically vendor-supplied.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // SL — Student Lifecycle (16 capabilities) — category-driven baseline
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-SL-001', // Prospect Pipeline Orchestration
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS', 'CRM'])) return 100;
      return 0;
    },
    rationale: 'SIS/CRM platforms are built for prospect pipeline management.',
  },
  {
    capabilityCode: 'FHE-SL-002', // Offer Processing & Condition Tracking
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'SIS handles offers natively; CRM is partial.',
  },
  {
    capabilityCode: 'FHE-SL-003', // Onboarding Workflow Automation
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'SIS automates pre-arrival onboarding; CRM supports marketing touchpoints.',
  },
  {
    capabilityCode: 'FHE-SL-004', // Registration & Enrolment Engine
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      return 0;
    },
    rationale: 'Core SIS function — registration and enrolment.',
  },
  {
    capabilityCode: 'FHE-SL-005', // Progress Monitoring Framework
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'SIS holds academic standing data; LMS holds engagement signals.',
  },
  {
    capabilityCode: 'FHE-SL-006', // Interruption & Withdrawal Processing
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      return 0;
    },
    rationale: 'Interruption workflows live in the SIS.',
  },
  {
    capabilityCode: 'FHE-SL-007', // Award Conferral Processing
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      return 0;
    },
    rationale: 'Awards, transcripts and classification are SIS functions.',
  },
  {
    capabilityCode: 'FHE-SL-008', // Post-completion Engagement Tracking
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      if (isCategory(sys, ['SIS'])) return 50;
      return 0;
    },
    rationale: 'CRM owns alumni engagement; SIS provides graduate-destination baseline.',
  },
  {
    capabilityCode: 'FHE-SL-009', // Attendance & Engagement Capture
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'SIS tracks formal attendance; LMS captures digital engagement.',
  },
  {
    capabilityCode: 'FHE-SL-010', // Placement & Work-Based Learning Coordination
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'SIS platforms offer partial placement modules.',
  },
  {
    capabilityCode: 'FHE-SL-011', // International Mobility Administration
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'SIS supports exchange data; full mobility often requires add-ons.',
  },
  {
    capabilityCode: 'FHE-SL-012', // Reassessment & Repeat Scheduling
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 100;
      return 0;
    },
    rationale: 'Resit and repeat scheduling is core SIS functionality.',
  },
  {
    capabilityCode: 'FHE-SL-013', // Sponsorship & Fee-Payer Liaison
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'SIS finance modules handle sponsor billing.',
  },
  {
    capabilityCode: 'FHE-SL-014', // Prior Experiential Learning Evaluation
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'RPL is a specialised SIS module, often requiring customisation.',
  },
  {
    capabilityCode: 'FHE-SL-015', // Timetable Slot Allocation Engine
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'Timetabling ships with SIS but often relies on specialist engines.',
  },
  {
    capabilityCode: 'FHE-SL-016', // Student Welfare Case Coordination
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS', 'CRM'])) return 50;
      return 0;
    },
    rationale: 'Welfare case modules are partial in mainstream SIS/CRM products.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // RO — Research Operations (15 capabilities) — sparse rules, mostly 0
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-RO-007', // Doctoral Candidature Administration
    rule: (sys, _p) => {
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'SIS platforms cover PGR candidature at a partial level.',
  },
  {
    capabilityCode: 'FHE-RO-008', // Research Costing & Pricing Engine
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 50;
      return 0;
    },
    rationale: 'HCM finance modules provide partial research costing inputs.',
  },
  {
    capabilityCode: 'FHE-RO-015', // Research Performance Scorecard
    rule: (sys, p) => {
      if (hasAny(p?.apiStandards, ['OData', 'GraphQL'])) return 50;
      return 0;
    },
    rationale: 'Analytics-ready APIs enable research scorecards.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // PC — People & Culture (15 capabilities) — HCM category baseline
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-PC-001', // Workforce Demand Modelling
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM core function — workforce planning.',
  },
  {
    capabilityCode: 'FHE-PC-002', // Talent Acquisition & Onboarding Pipeline
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM platforms bundle ATS and onboarding.',
  },
  {
    capabilityCode: 'FHE-PC-003', // Appraisal & Contribution Review Cycle
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM supports performance cycles natively.',
  },
  {
    capabilityCode: 'FHE-PC-004', // Professional Development & CPD Ledger
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      if (isCategory(sys, ['LMS'])) return 50;
      return 0;
    },
    rationale: 'HCM and LMS both contribute to CPD tracking.',
  },
  {
    capabilityCode: 'FHE-PC-005', // Payroll & Compensation Integration Layer
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM integrates with payroll systems by design.',
  },
  {
    capabilityCode: 'FHE-PC-006', // Succession & Critical-Role Planning
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'Succession planning is a standard HCM module.',
  },
  {
    capabilityCode: 'FHE-PC-007', // Absence & Leave Administration
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'Leave administration is a baseline HCM feature.',
  },
  {
    capabilityCode: 'FHE-PC-008', // Workload Allocation & Distribution
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 50;
      return 0;
    },
    rationale: 'HCM provides partial workload allocation; universities often layer a specialist tool.',
  },
  {
    capabilityCode: 'FHE-PC-009', // Employee Relations Case Tracker
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM supports ER casework.',
  },
  {
    capabilityCode: 'FHE-PC-010', // Staff Induction & Probation Workflow
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'Induction checklists ship with HCM.',
  },
  {
    capabilityCode: 'FHE-PC-011', // Diversity, Equity & Inclusion Dashboard
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM platforms provide DEI and pay-gap dashboards.',
  },
  {
    capabilityCode: 'FHE-PC-012', // Casual & Fixed-Term Contract Administration
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'Contract administration is a core HCM function.',
  },
  {
    capabilityCode: 'FHE-PC-013', // Right-to-Work & DBS Verification
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM']) && sys.regions.includes('UK')) return 100;
      if (isCategory(sys, ['HCM'])) return 50;
      return 0;
    },
    rationale: 'UK-deployed HCM integrates with Home Office checks.',
  },
  {
    capabilityCode: 'FHE-PC-014', // Exit & Offboarding Process
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 100;
      return 0;
    },
    rationale: 'HCM handles offboarding workflows.',
  },
  {
    capabilityCode: 'FHE-PC-015', // Occupational Health & Wellbeing Programme
    rule: (sys, _p) => {
      if (isCategory(sys, ['HCM'])) return 50;
      return 0;
    },
    rationale: 'HCM provides partial OH referral workflows.',
  },

  // ══════════════════════════════════════════════════════════════════════
  // EN — Engagement & Communications (15 capabilities) — CRM baseline
  // ══════════════════════════════════════════════════════════════════════
  {
    capabilityCode: 'FHE-EN-001', // Multi-channel Campaign Orchestration
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      return 0;
    },
    rationale: 'Multi-channel marketing is a CRM core feature.',
  },
  {
    capabilityCode: 'FHE-EN-002', // Stakeholder Relationship Ledger
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      return 0;
    },
    rationale: 'CRM is literally a stakeholder ledger.',
  },
  {
    capabilityCode: 'FHE-EN-003', // Event Lifecycle Coordination
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      return 0;
    },
    rationale: 'CRM platforms own event management.',
  },
  {
    capabilityCode: 'FHE-EN-004', // Brand Asset & Style Governance
    rule: (_sys, _p) => 0,
    rationale: 'Brand asset governance is a DAM specialism — default 0.',
  },
  {
    capabilityCode: 'FHE-EN-005', // Sentiment & Reputation Monitoring
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM platforms include sentiment/social-listening add-ons.',
  },
  {
    capabilityCode: 'FHE-EN-006', // Philanthropy & Donor Pipeline
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      return 0;
    },
    rationale: 'Donor pipeline management is a standard CRM module.',
  },
  {
    capabilityCode: 'FHE-EN-007', // Corporate Partnership Brokerage
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      return 0;
    },
    rationale: 'CRM tracks employer and partner accounts.',
  },
  {
    capabilityCode: 'FHE-EN-008', // Web Content & Digital-Channel Governance
    rule: (_sys, _p) => 0,
    rationale: 'CMS governance is a specialist toolset — default 0.',
  },
  {
    capabilityCode: 'FHE-EN-009', // Prospectus & Publication Production
    rule: (_sys, _p) => 0,
    rationale: 'Prospectus production is outside mainstream vendor scope.',
  },
  {
    capabilityCode: 'FHE-EN-010', // Internal Communications Orchestration
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM supports all-staff comms workflows.',
  },
  {
    capabilityCode: 'FHE-EN-011', // Complaint & Feedback Resolution Pathway
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 100;
      if (isCategory(sys, ['SIS', 'SJMS'])) return 50;
      return 0;
    },
    rationale: 'CRM tracks complaints; SIS holds partial records.',
  },
  {
    capabilityCode: 'FHE-EN-012', // Civic & Community Engagement Register
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM supports community engagement logging.',
  },
  {
    capabilityCode: 'FHE-EN-013', // Media Relations & Press-Office Workflow
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM stores journalist contacts and press workflows.',
  },
  {
    capabilityCode: 'FHE-EN-014', // Merchandise & Licensing Administration
    rule: (_sys, _p) => 0,
    rationale: 'Merchandise licensing is a niche finance function — default 0.',
  },
  {
    capabilityCode: 'FHE-EN-015', // Conference & Venue Hire Revenue Channel
    rule: (sys, _p) => {
      if (isCategory(sys, ['CRM'])) return 50;
      return 0;
    },
    rationale: 'CRM supports venue and conference bookings.',
  },
];

/** Lookup helper: O(1) access by capability code. */
export const RULES_BY_CODE: Map<string, ScoringRule> = new Map(
  FHE_SCORING_RULES.map((r) => [r.capabilityCode, r]),
);
