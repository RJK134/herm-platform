import { Shield, Lock, FileCheck2, AlertTriangle, ExternalLink } from 'lucide-react';
import { PRODUCT } from '../lib/branding';

// Phase 14.10 — public Trust Centre. Procurement officers and InfoSec
// reviewers expect to find SOC 2 / ISO 27001 / Cyber Essentials Plus
// status, pen-test cadence, SBOM access, and a security-disclosure
// channel before authorising adoption. This page answers those
// questions in one place. Public route — no auth required so anyone
// evaluating the platform pre-procurement can see it.
//
// Content is hand-curated from the actual Phase 11 platform posture.
// All status fields are explicit ("planned" / "in progress" / "achieved")
// rather than vague — InfoSec reviewers won't accept marketing language
// here. Update CERT_STATUS in this file as the operational compliance
// programme advances; that's the single source of truth for the page.

type CertStatus = 'achieved' | 'in_progress' | 'planned';

interface Certification {
  name: string;
  status: CertStatus;
  description: string;
  expectedAt?: string;
}

const CERT_STATUS: Certification[] = [
  {
    name: 'Cyber Essentials Plus',
    status: 'planned',
    description:
      'UK NCSC-backed scheme covering the five technical controls (firewalls, secure config, user access control, malware protection, patch management) with independent assessor verification.',
    expectedAt: '2026 Q4',
  },
  {
    name: 'ISO/IEC 27001:2022',
    status: 'planned',
    description:
      `International standard for information security management systems. Scope will cover the entire ${PRODUCT.name} platform, the Vercel-hosted SPA, and the Neon-hosted production database.`,
    expectedAt: '2027 Q2',
  },
  {
    name: 'SOC 2 Type II',
    status: 'planned',
    description:
      'AICPA Trust Services Criteria (Security + Availability + Confidentiality). Type II requires a 6+ month observation window so this lands after the Type I report is in hand.',
    expectedAt: '2027 Q4',
  },
];

interface SecurityPractice {
  icon: typeof Shield;
  title: string;
  detail: string;
}

const SECURITY_PRACTICES: SecurityPractice[] = [
  {
    icon: Lock,
    title: 'Identity & Access',
    detail:
      'SAML 2.0 + OIDC SSO with per-tenant identity provider configuration. Supports UK Access Management Federation for higher-education institutions. SCIM 2.0 user provisioning. JWT session tokens with rotating signing keys.',
  },
  {
    icon: Shield,
    title: 'Encryption',
    detail:
      'TLS 1.3 in transit. AES-256-GCM envelope encryption at rest for SSO secrets (SAML certificates, OIDC client secrets) per Phase 11.2 — secrets re-key on rotation. Database backed by Neon Postgres with encryption at rest.',
  },
  {
    icon: FileCheck2,
    title: 'Audit & Accountability',
    detail:
      'Immutable audit log of every authentication event, SSO configuration change, key issuance, and privileged action. Retained per UK GDPR Article 30 records-of-processing requirements. Soft-delete cascade with retention scheduler ensures GDPR Article 17 erasure requests propagate correctly.',
  },
  {
    icon: AlertTriangle,
    title: 'Vulnerability Management',
    detail:
      'Dependency scanning on every CI run via npm audit + GitGuardian secret scanning. Annual third-party penetration test (results available under NDA). SBOM produced on every release build.',
  },
];

const STATUS_STYLE: Record<CertStatus, string> = {
  achieved:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  in_progress:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  planned: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const STATUS_LABEL: Record<CertStatus, string> = {
  achieved: 'Achieved',
  in_progress: 'In progress',
  planned: 'Planned',
};

export function TrustCentre() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Trust Centre
          </h1>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-300">
            How {PRODUCT.name} ({PRODUCT.longName}) protects institutional
            data and meets UK higher-education InfoSec gating requirements.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            In product naming, &ldquo;FHE&rdquo; denotes {PRODUCT.vendor}. The
            full product name describes the system-procurement offering; it is
            not a letter-by-letter expansion of the &ldquo;FHE&rdquo;
            abbreviation.
          </p>
        </header>

        <section aria-labelledby="certifications-heading" className="mb-12">
          <h2
            id="certifications-heading"
            className="text-xl font-semibold text-gray-900 dark:text-white mb-4"
          >
            Certifications
          </h2>
          <div className="grid gap-4 sm:grid-cols-1">
            {CERT_STATUS.map((cert) => (
              <div
                key={cert.name}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 bg-white dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {cert.name}
                  </h3>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[cert.status]}`}
                  >
                    {STATUS_LABEL[cert.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {cert.description}
                </p>
                {cert.expectedAt && cert.status !== 'achieved' && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Target: {cert.expectedAt}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="practices-heading" className="mb-12">
          <h2
            id="practices-heading"
            className="text-xl font-semibold text-gray-900 dark:text-white mb-4"
          >
            Security & Privacy Practices
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {SECURITY_PRACTICES.map((practice) => {
              const Icon = practice.icon;
              return (
                <div
                  key={practice.title}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 bg-white dark:bg-gray-800"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      aria-hidden="true"
                      className="w-5 h-5 text-teal"
                    />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {practice.title}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {practice.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="disclosure-heading" className="mb-12">
          <h2
            id="disclosure-heading"
            className="text-xl font-semibold text-gray-900 dark:text-white mb-4"
          >
            Reporting a Security Issue
          </h2>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 bg-white dark:bg-gray-800">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              We operate a coordinated-disclosure programme. If you have
              identified a security issue affecting {PRODUCT.name}, please
              email{' '}
              <a
                href="mailto:security@futurehorizonseducation.com"
                className="text-teal underline"
              >
                security@futurehorizonseducation.com
              </a>
              . Please do <strong>not</strong> file public GitHub issues
              for security findings.
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We aim to acknowledge reports within 2 working days and to
              issue a fix or risk-acceptance position within 30 days. Hall
              of fame credit available on request.
            </p>
          </div>
        </section>

        <section aria-labelledby="sbom-heading" className="mb-12">
          <h2
            id="sbom-heading"
            className="text-xl font-semibold text-gray-900 dark:text-white mb-4"
          >
            Documentation
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <ExternalLink
                aria-hidden="true"
                className="w-4 h-4 text-gray-400"
              />
              <span className="text-gray-700 dark:text-gray-300">
                SBOM (Software Bill of Materials) — available on request
                via the security mailbox above
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ExternalLink
                aria-hidden="true"
                className="w-4 h-4 text-gray-400"
              />
              <span className="text-gray-700 dark:text-gray-300">
                Penetration-test summary — annual, available under NDA
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ExternalLink
                aria-hidden="true"
                className="w-4 h-4 text-gray-400"
              />
              <span className="text-gray-700 dark:text-gray-300">
                Data Processing Addendum (UK GDPR / DPA 2018) — provided
                on contract execution
              </span>
            </li>
          </ul>
        </section>

        <footer className="text-xs text-gray-500 dark:text-gray-400 mt-16 pt-6 border-t border-gray-200 dark:border-gray-700">
          Last reviewed: 2026-05-08. Page maintained as part of the
          Phase 14.10 UAT remediation programme.
        </footer>
      </div>
    </div>
  );
}
