import { describe, it, expect } from 'vitest';
import type { VendorSystem, VendorProfile } from '@prisma/client';
import {
  FHE_SCORING_RULES,
  RULES_BY_CODE,
  hasAny,
  hasAll,
  countMatches,
  isCategory,
} from './fhe-scoring-rules';

// ─── Fixture factories ────────────────────────────────────────────────────

function makeSystem(overrides: Partial<VendorSystem> = {}): VendorSystem {
  return {
    id: 'sys-test',
    name: 'Test System',
    vendor: 'Test Vendor',
    category: 'SIS',
    description: 'Test description',
    regions: ['UK'],
    cloudNative: true,
    website: null,
    logoUrl: null,
    isOwnSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as VendorSystem;
}

function makeProfile(overrides: Partial<VendorProfile> = {}): VendorProfile {
  return {
    id: 'prof-test',
    systemId: 'sys-test',
    foundedYear: 2020,
    headquarters: 'Test HQ',
    employees: '1000',
    marketShare: 'Niche',
    gartnerPosition: null,
    deploymentModel: ['Cloud'],
    techStack: 'Node.js',
    apiStandards: ['REST'],
    integrationProtocols: ['SAML 2.0', 'OIDC'],
    certifications: ['ISO 27001', 'SOC 2 Type II'],
    pricingModel: 'Subscription',
    typicalCostRange: '£10/student/year',
    implementationTime: '6 months',
    keyStrengths: [],
    knownLimitations: [],
    recentNews: null,
    lastUpdated: new Date(),
    ...overrides,
  } as VendorProfile;
}

// ─── Helper unit tests ────────────────────────────────────────────────────

describe('hasAny', () => {
  it('returns true on partial case-insensitive match', () => {
    expect(hasAny(['SAML 2.0', 'OIDC'], ['saml'])).toBe(true);
  });

  it('returns true when at least one needle matches', () => {
    expect(hasAny(['REST'], ['SAML', 'REST'])).toBe(true);
  });

  it('returns false when no needle matches', () => {
    expect(hasAny(['REST'], ['SAML', 'OIDC'])).toBe(false);
  });

  it('returns false for empty/undefined arrays', () => {
    expect(hasAny(undefined, ['SAML'])).toBe(false);
    expect(hasAny([], ['SAML'])).toBe(false);
    expect(hasAny(null, ['SAML'])).toBe(false);
  });
});

describe('hasAll', () => {
  it('returns true only if all needles are present', () => {
    expect(hasAll(['SAML 2.0', 'OIDC'], ['SAML', 'OIDC'])).toBe(true);
  });

  it('returns false when a needle is missing', () => {
    expect(hasAll(['SAML 2.0'], ['SAML', 'OIDC'])).toBe(false);
  });
});

describe('countMatches', () => {
  it('counts distinct needles that appear in the array', () => {
    expect(
      countMatches(['SOC 2 Type II', 'ISO 27001', 'FedRAMP High'], [
        'SOC 2',
        'ISO 27001',
        'FedRAMP',
      ]),
    ).toBe(3);
  });

  it('counts zero when none of the needles match', () => {
    expect(countMatches(['GDPR'], ['SOC 2', 'ISO 27001'])).toBe(0);
  });
});

describe('isCategory', () => {
  it('matches category case-insensitively', () => {
    expect(isCategory(makeSystem({ category: 'SIS' }), ['sis'])).toBe(true);
  });

  it('returns false for non-matching categories', () => {
    expect(isCategory(makeSystem({ category: 'LMS' }), ['SIS', 'HCM'])).toBe(false);
  });
});

// ─── Rule tests ───────────────────────────────────────────────────────────

describe('FHE-ET-001 (Identity Federation & SSO)', () => {
  const rule = RULES_BY_CODE.get('FHE-ET-001')!;

  it('scores 100 when both SAML and OIDC are present', () => {
    const sys = makeSystem();
    const profile = makeProfile({ integrationProtocols: ['SAML 2.0', 'OIDC'] });
    expect(rule.rule(sys, profile)).toBe(100);
  });

  it('scores 50 when only SAML is present', () => {
    const sys = makeSystem();
    const profile = makeProfile({ integrationProtocols: ['SAML 2.0'] });
    expect(rule.rule(sys, profile)).toBe(50);
  });

  it('scores 0 when neither SAML nor OIDC is present', () => {
    const sys = makeSystem();
    const profile = makeProfile({ integrationProtocols: ['Custom'] });
    expect(rule.rule(sys, profile)).toBe(0);
  });

  it('scores 0 when profile is null', () => {
    const sys = makeSystem();
    expect(rule.rule(sys, null)).toBe(0);
  });
});

describe('FHE-ET-002 (API Gateway & Rate Governance)', () => {
  const rule = RULES_BY_CODE.get('FHE-ET-002')!;

  it('scores 100 when 3+ API standards are published', () => {
    const profile = makeProfile({ apiStandards: ['REST', 'GraphQL', 'OData', 'SOAP'] });
    expect(rule.rule(makeSystem(), profile)).toBe(100);
  });

  it('scores 50 when 1 API standard is published', () => {
    const profile = makeProfile({ apiStandards: ['REST'] });
    expect(rule.rule(makeSystem(), profile)).toBe(50);
  });

  it('scores 0 when no API standards are published', () => {
    const profile = makeProfile({ apiStandards: [] });
    expect(rule.rule(makeSystem(), profile)).toBe(0);
  });
});

describe('FHE-ET-005 (Disaster Recovery & Business Continuity)', () => {
  const rule = RULES_BY_CODE.get('FHE-ET-005')!;

  it('scores 100 for ISO 27001 / SOC 2 / FedRAMP certified vendors', () => {
    const profile = makeProfile({ certifications: ['ISO 27001', 'SOC 2 Type II'] });
    expect(rule.rule(makeSystem(), profile)).toBe(100);
  });

  it('scores 50 for Cyber Essentials or GDPR only', () => {
    const profile = makeProfile({ certifications: ['Cyber Essentials Plus'] });
    expect(rule.rule(makeSystem(), profile)).toBe(50);
  });

  it('scores 0 for uncertified vendors', () => {
    const profile = makeProfile({ certifications: [] });
    expect(rule.rule(makeSystem(), profile)).toBe(0);
  });
});

describe('FHE-GR-006 (Data Protection Impact Orchestration)', () => {
  const rule = RULES_BY_CODE.get('FHE-GR-006')!;

  it('scores 100 for GDPR-certified vendors', () => {
    const profile = makeProfile({ certifications: ['GDPR compliant'] });
    expect(rule.rule(makeSystem(), profile)).toBe(100);
  });

  it('scores 50 for ISO 27001 / SOC 2 without GDPR', () => {
    const profile = makeProfile({ certifications: ['ISO 27001', 'SOC 2'] });
    expect(rule.rule(makeSystem(), profile)).toBe(50);
  });

  it('scores 0 when no relevant certifications are present', () => {
    const profile = makeProfile({ certifications: [] });
    expect(rule.rule(makeSystem(), profile)).toBe(0);
  });
});

describe('FHE-DL-001 (VLE Provisioning)', () => {
  const rule = RULES_BY_CODE.get('FHE-DL-001')!;

  it('scores 100 for LMS category', () => {
    expect(rule.rule(makeSystem({ category: 'LMS' }), makeProfile())).toBe(100);
  });

  it('scores 0 for SIS category', () => {
    expect(rule.rule(makeSystem({ category: 'SIS' }), makeProfile())).toBe(0);
  });
});

describe('FHE-DL-012 (LTI & EdTech Connector Hub)', () => {
  const rule = RULES_BY_CODE.get('FHE-DL-012')!;

  it('scores 100 for LMS with LTI 1.3 support', () => {
    const sys = makeSystem({ category: 'LMS' });
    const profile = makeProfile({ apiStandards: ['LTI 1.3'] });
    expect(rule.rule(sys, profile)).toBe(100);
  });

  it('scores 50 for non-LMS with LTI support', () => {
    const sys = makeSystem({ category: 'SIS' });
    const profile = makeProfile({ apiStandards: ['LTI 1.3'] });
    expect(rule.rule(sys, profile)).toBe(50);
  });

  it('scores 0 for system without LTI support', () => {
    const sys = makeSystem({ category: 'SIS' });
    const profile = makeProfile({ apiStandards: ['REST'] });
    expect(rule.rule(sys, profile)).toBe(0);
  });
});

describe('FHE-II-004 (Statutory Return Pipeline)', () => {
  const rule = RULES_BY_CODE.get('FHE-II-004')!;

  it('scores 100 when HESA Data Futures is an API standard', () => {
    const sys = makeSystem({ regions: ['UK'], category: 'SIS' });
    const profile = makeProfile({ apiStandards: ['HESA Data Futures native'] });
    expect(rule.rule(sys, profile)).toBe(100);
  });

  it('scores 50 for UK-deployed SIS without native HESA support', () => {
    const sys = makeSystem({ regions: ['UK'], category: 'SIS' });
    const profile = makeProfile({ apiStandards: ['REST'] });
    expect(rule.rule(sys, profile)).toBe(50);
  });

  it('scores 0 for non-UK SIS without HESA', () => {
    const sys = makeSystem({ regions: ['US'], category: 'SIS' });
    const profile = makeProfile({ apiStandards: ['REST'] });
    expect(rule.rule(sys, profile)).toBe(0);
  });
});

describe('FHE-SL-004 (Registration & Enrolment Engine)', () => {
  const rule = RULES_BY_CODE.get('FHE-SL-004')!;

  it('scores 100 for SIS category', () => {
    expect(rule.rule(makeSystem({ category: 'SIS' }), makeProfile())).toBe(100);
  });

  it('scores 100 for SJMS category', () => {
    expect(rule.rule(makeSystem({ category: 'SJMS' }), makeProfile())).toBe(100);
  });

  it('scores 0 for LMS category', () => {
    expect(rule.rule(makeSystem({ category: 'LMS' }), makeProfile())).toBe(0);
  });

  it('scores 0 for CRM category', () => {
    expect(rule.rule(makeSystem({ category: 'CRM' }), makeProfile())).toBe(0);
  });
});

describe('FHE-PC-005 (Payroll & Compensation Integration Layer)', () => {
  const rule = RULES_BY_CODE.get('FHE-PC-005')!;

  it('scores 100 for HCM category', () => {
    expect(rule.rule(makeSystem({ category: 'HCM' }), makeProfile())).toBe(100);
  });

  it('scores 0 for non-HCM categories', () => {
    expect(rule.rule(makeSystem({ category: 'SIS' }), makeProfile())).toBe(0);
    expect(rule.rule(makeSystem({ category: 'LMS' }), makeProfile())).toBe(0);
  });
});

describe('FHE-EN-001 (Multi-channel Campaign Orchestration)', () => {
  const rule = RULES_BY_CODE.get('FHE-EN-001')!;

  it('scores 100 for CRM category', () => {
    expect(rule.rule(makeSystem({ category: 'CRM' }), makeProfile())).toBe(100);
  });

  it('scores 0 for SIS category', () => {
    expect(rule.rule(makeSystem({ category: 'SIS' }), makeProfile())).toBe(0);
  });
});

describe('rule catalogue invariants', () => {
  it('every rule has a non-empty capability code and rationale', () => {
    for (const r of FHE_SCORING_RULES) {
      expect(r.capabilityCode).toMatch(/^FHE-[A-Z]{2}-\d{3}$/);
      expect(r.rationale.length).toBeGreaterThan(0);
    }
  });

  it('every rule returns one of 0/50/100 for a generic SIS input', () => {
    const sys = makeSystem();
    const profile = makeProfile();
    for (const r of FHE_SCORING_RULES) {
      const v = r.rule(sys, profile);
      expect([0, 50, 100]).toContain(v);
    }
  });

  it('every rule is safe when profile is null', () => {
    const sys = makeSystem();
    for (const r of FHE_SCORING_RULES) {
      expect(() => r.rule(sys, null)).not.toThrow();
    }
  });

  it('RULES_BY_CODE map is aligned with FHE_SCORING_RULES array', () => {
    expect(RULES_BY_CODE.size).toBe(FHE_SCORING_RULES.length);
    for (const r of FHE_SCORING_RULES) {
      expect(RULES_BY_CODE.get(r.capabilityCode)).toBe(r);
    }
  });
});
