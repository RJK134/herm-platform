/**
 * Phase 11.10 — UKAMF cert auto-rotation tests.
 *
 * The Prisma client is mocked (matches the pattern in
 * `services/retention/scheduler.test.ts`). The unit under test is the
 * fetch → parse → diff → write loop, the audit-row shape, and the
 * dry-run / failure handling. Real DB integration is covered by the
 * SAML / OIDC live-IdP suites that landed in PR #67.
 *
 * `fetch` is stubbed via `vi.stubGlobal` so these tests never touch the
 * live UKAMF feed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock, updateMock, auditLogCreateMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
}));
vi.mock('../../utils/prisma', () => ({
  default: {
    ssoIdentityProvider: {
      findMany: findManyMock,
      update: updateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { encryptSecretMock, decryptSecretMock } = vi.hoisted(() => ({
  encryptSecretMock: vi.fn((s: string) => `enc:v1:${s}`),
  decryptSecretMock: vi.fn((s: string | null | undefined) =>
    typeof s === 'string' && s.startsWith('enc:v1:') ? s.slice('enc:v1:'.length) : s ?? null,
  ),
}));
vi.mock('../../lib/secret-cipher', () => ({
  encryptSecret: encryptSecretMock,
  decryptSecret: decryptSecretMock,
}));

import {
  parseMetadataFeed,
  rotateOnce,
  isUkamfRotationEnabled,
  startUkamfRotationScheduler,
  stopUkamfRotationScheduler,
} from './ukamf-cert-rotation';

const ENTITY_A = 'https://idp-a.uni.test/shibboleth';
const ENTITY_B = 'https://idp-b.uni.test/shibboleth';
const ENTITY_C_NOT_IN_FEED = 'https://idp-c.uni.test/shibboleth';

const CERT_A_OLD =
  'MIIDazCCAlOgAwIBAgIUAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-CERT-A-OLD-ZZZ';
const CERT_A_NEW =
  'MIIDazCCAlOgAwIBAgIUbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-CERT-A-NEW-ZZZ';
const CERT_B =
  'MIIDazCCAlOgAwIBAgIUccccccccccccccccccccccccccccccccccc-CERT-B-ZZZ';

function pem(b64: string): string {
  const wrapped = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

const FIXTURE_XML = `<?xml version="1.0"?>
<EntitiesDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                    xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <EntityDescriptor entityID="${ENTITY_A}">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
      <KeyDescriptor use="signing">
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${CERT_A_NEW}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </KeyDescriptor>
      <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                           Location="${ENTITY_A}/SSO"/>
    </IDPSSODescriptor>
  </EntityDescriptor>
  <EntityDescriptor entityID="${ENTITY_B}">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
      <KeyDescriptor>
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${CERT_B}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </KeyDescriptor>
      <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                           Location="${ENTITY_B}/SSO"/>
    </IDPSSODescriptor>
  </EntityDescriptor>
</EntitiesDescriptor>
`;

beforeEach(() => {
  findManyMock.mockReset();
  updateMock.mockReset();
  auditLogCreateMock.mockReset();
  encryptSecretMock.mockReset();
  encryptSecretMock.mockImplementation((s: string) => `enc:v1:${s}`);
  decryptSecretMock.mockReset();
  decryptSecretMock.mockImplementation((s: string | null | undefined) =>
    typeof s === 'string' && s.startsWith('enc:v1:') ? s.slice('enc:v1:'.length) : s ?? null,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseMetadataFeed', () => {
  it('extracts signing certs keyed by entityID', () => {
    const map = parseMetadataFeed(FIXTURE_XML);
    expect(map.size).toBe(2);
    // Compare against the normalised form because toPem() wraps the
    // base64 body at 64 chars (so a substring assertion against the
    // original 70-char fixture would straddle a line break).
    const stripWhitespace = (s: string): string =>
      s.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    expect(stripWhitespace(map.get(ENTITY_A)?.signingCertPem ?? '')).toBe(CERT_A_NEW);
    expect(stripWhitespace(map.get(ENTITY_B)?.signingCertPem ?? '')).toBe(CERT_B);
  });

  it('treats KeyDescriptor without @use as a signing key', () => {
    const map = parseMetadataFeed(FIXTURE_XML);
    expect(map.get(ENTITY_B)).toBeDefined();
  });

  it('ignores encryption-only KeyDescriptor', () => {
    const xml = `<?xml version="1.0"?>
<EntitiesDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                    xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <EntityDescriptor entityID="https://enc-only.test">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
      <KeyDescriptor use="encryption">
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${CERT_B}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </KeyDescriptor>
    </IDPSSODescriptor>
  </EntityDescriptor>
</EntitiesDescriptor>`;
    const map = parseMetadataFeed(xml);
    expect(map.size).toBe(0);
  });

  it('skips entities without IDPSSODescriptor (SP-only entries)', () => {
    const xml = `<?xml version="1.0"?>
<EntitiesDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                    xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <EntityDescriptor entityID="https://sp-only.test">
    <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
      <KeyDescriptor use="signing">
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${CERT_B}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </KeyDescriptor>
    </SPSSODescriptor>
  </EntityDescriptor>
</EntitiesDescriptor>`;
    const map = parseMetadataFeed(xml);
    expect(map.size).toBe(0);
  });
});

describe('rotateOnce', () => {
  function fakeIdp(over: Partial<Record<string, unknown>>): Record<string, unknown> {
    return {
      id: 'idp-x',
      institutionId: 'inst-x',
      protocol: 'SAML',
      displayName: 'IdP X',
      samlEntityId: ENTITY_A,
      samlSsoUrl: `${ENTITY_A}/SSO`,
      samlCert: `enc:v1:${pem(CERT_A_OLD)}`,
      oidcIssuer: null,
      oidcClientId: null,
      oidcClientSecret: null,
      jitProvisioning: true,
      defaultRole: 'VIEWER',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: 100,
      ...over,
    };
  }

  it('returns no-op stats when UKAMF_METADATA_URL is unset and no override given', async () => {
    const originalUkamfEnv = Object.fromEntries(
      Object.keys(process.env)
        .filter((key) => key.startsWith('UKAMF_'))
        .map((key) => [key, process.env[key]]),
    );

    for (const key of Object.keys(originalUkamfEnv)) {
      delete process.env[key];
    }

    try {
      const stats = await rotateOnce({ feedUrl: undefined });
      expect(stats).toEqual({ scanned: 0, rotated: 0, skipped: 0, errors: 0 });
      expect(findManyMock).not.toHaveBeenCalled();
    } finally {
      for (const key of Object.keys(process.env).filter((envKey) => envKey.startsWith('UKAMF_'))) {
        delete process.env[key];
      }
      for (const [key, value] of Object.entries(originalUkamfEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it('rotates IdP A (different cert), skips IdP B (matching cert), skips IdP C (not in feed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_XML, { status: 200 })),
    );
    findManyMock.mockResolvedValue([
      fakeIdp({ id: 'idp-a', samlEntityId: ENTITY_A, samlCert: `enc:v1:${pem(CERT_A_OLD)}` }),
      fakeIdp({ id: 'idp-b', samlEntityId: ENTITY_B, samlCert: `enc:v1:${pem(CERT_B)}` }),
      fakeIdp({ id: 'idp-c', samlEntityId: ENTITY_C_NOT_IN_FEED, samlCert: `enc:v1:${pem('CERT-C-IGNORED')}` }),
    ]);
    updateMock.mockResolvedValue({});
    auditLogCreateMock.mockResolvedValue({});

    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });

    expect(stats).toEqual({ scanned: 3, rotated: 1, skipped: 2, errors: 0 });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateMock.mock.calls[0]?.[0];
    expect(updateArgs?.where?.id).toBe('idp-a');
    expect(updateArgs?.data?.samlCert).toMatch(/^enc:v1:/);

    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const auditArgs = auditLogCreateMock.mock.calls[0]?.[0];
    expect(auditArgs?.data?.action).toBe('auth.sso.cert_rotated');
    expect(auditArgs?.data?.entityId).toBe('idp-a');
    const changes = auditArgs?.data?.changes as Record<string, unknown>;
    expect(changes['samlEntityId']).toBe(ENTITY_A);
    expect(changes['oldCertSha256']).toBeTruthy();
    expect(changes['newCertSha256']).toBeTruthy();
    expect(changes['oldCertSha256']).not.toBe(changes['newCertSha256']);
  });

  it('dry-run does not write rows or emit audits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_XML, { status: 200 })),
    );
    findManyMock.mockResolvedValue([
      fakeIdp({ id: 'idp-a', samlEntityId: ENTITY_A, samlCert: `enc:v1:${pem(CERT_A_OLD)}` }),
    ]);

    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml', dryRun: true });
    expect(stats.rotated).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it('counts an error and writes nothing when the fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENETUNREACH');
      }),
    );
    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });
    expect(stats.errors).toBe(1);
    expect(stats.rotated).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('counts an error and writes nothing when the fetch returns non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream down', { status: 503 })),
    );
    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });
    expect(stats.errors).toBe(1);
    expect(stats.rotated).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('counts an error and writes nothing when the XML is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<not-xml', { status: 200 })),
    );
    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });
    expect(stats.errors).toBe(1);
    expect(stats.rotated).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('proceeds with rotation when the stored cert fails to decrypt (treats as unknown)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_XML, { status: 200 })),
    );
    decryptSecretMock.mockImplementationOnce(() => {
      throw new Error('bad cipher text');
    });
    findManyMock.mockResolvedValue([
      fakeIdp({ id: 'idp-a', samlEntityId: ENTITY_A, samlCert: `enc:v1:${pem(CERT_A_OLD)}` }),
    ]);
    updateMock.mockResolvedValue({});
    auditLogCreateMock.mockResolvedValue({});

    const { logger } = await import('../../lib/logger');
    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });
    expect(stats.rotated).toBe(1);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ idpId: 'idp-a' }),
      'ukamf.rotate.decrypt-failed-overwriting',
    );
  });

  it('counts a per-row error when prisma update throws but does not abort the sweep', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_XML, { status: 200 })),
    );
    findManyMock.mockResolvedValue([
      fakeIdp({ id: 'idp-a', samlEntityId: ENTITY_A, samlCert: `enc:v1:${pem(CERT_A_OLD)}` }),
      fakeIdp({ id: 'idp-b', samlEntityId: ENTITY_B, samlCert: `enc:v1:${pem(CERT_B)}` }),
    ]);
    updateMock.mockRejectedValue(new Error('DB write conflict'));

    const stats = await rotateOnce({ feedUrl: 'https://example.test/feed.xml' });
    expect(stats.errors).toBe(1);
    expect(stats.rotated).toBe(0);
    expect(stats.skipped).toBe(1); // IdP B's cert matched, was skipped before the failure
  });
});

describe('isUkamfRotationEnabled', () => {
  const originals = {
    url: process.env['UKAMF_METADATA_URL'],
    enabled: process.env['UKAMF_ROTATION_ENABLED'],
    secretKey: process.env['SSO_SECRET_KEY'],
  };
  afterEach(() => {
    if (originals.url === undefined) delete process.env['UKAMF_METADATA_URL'];
    else process.env['UKAMF_METADATA_URL'] = originals.url;
    if (originals.enabled === undefined) delete process.env['UKAMF_ROTATION_ENABLED'];
    else process.env['UKAMF_ROTATION_ENABLED'] = originals.enabled;
    if (originals.secretKey === undefined) delete process.env['SSO_SECRET_KEY'];
    else process.env['SSO_SECRET_KEY'] = originals.secretKey;
  });

  it('false when neither env is set', () => {
    delete process.env['UKAMF_METADATA_URL'];
    delete process.env['UKAMF_ROTATION_ENABLED'];
    expect(isUkamfRotationEnabled()).toBe(false);
  });
  it('false when only the URL is set', () => {
    process.env['UKAMF_METADATA_URL'] = 'https://example.test/feed.xml';
    delete process.env['UKAMF_ROTATION_ENABLED'];
    expect(isUkamfRotationEnabled()).toBe(false);
  });
  it('false when only the flag is set', () => {
    delete process.env['UKAMF_METADATA_URL'];
    process.env['UKAMF_ROTATION_ENABLED'] = 'true';
    expect(isUkamfRotationEnabled()).toBe(false);
  });
  it('false when UKAMF vars are set but SSO_SECRET_KEY is unset', () => {
    process.env['UKAMF_METADATA_URL'] = 'https://example.test/feed.xml';
    process.env['UKAMF_ROTATION_ENABLED'] = 'true';
    delete process.env['SSO_SECRET_KEY'];
    expect(isUkamfRotationEnabled()).toBe(false);
  });
  it('true when both UKAMF vars and SSO_SECRET_KEY are set', () => {
    process.env['UKAMF_METADATA_URL'] = 'https://example.test/feed.xml';
    process.env['UKAMF_ROTATION_ENABLED'] = 'true';
    process.env['SSO_SECRET_KEY'] = 'a'.repeat(64);
    expect(isUkamfRotationEnabled()).toBe(true);
  });
});

describe('start/stopUkamfRotationScheduler', () => {
  afterEach(() => {
    stopUkamfRotationScheduler();
    delete process.env['UKAMF_ROTATION_ENABLED'];
    delete process.env['UKAMF_METADATA_URL'];
  });

  it('start is a no-op when not enabled', () => {
    delete process.env['UKAMF_ROTATION_ENABLED'];
    delete process.env['UKAMF_METADATA_URL'];
    expect(() => startUkamfRotationScheduler()).not.toThrow();
  });
});
