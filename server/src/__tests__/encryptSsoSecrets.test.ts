/**
 * Unit-level coverage for the encrypt-sso-secrets one-shot migration.
 * Mocks @prisma/client so the test never opens a real DB connection.
 *
 * The script lives at /prisma/seeds/encrypt-sso-secrets.ts; its `run`
 * export is the exercised entry point. The same module also exports
 * `isEncrypted` and `encryptOne` so we can verify byte-for-byte that
 * its output matches PR #63's `enc:v1:` shape (which the running server
 * uses to decrypt rows on read).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decryptSecret, _resetCipherKeyCache } from '../lib/secret-cipher';

// Mock the Prisma client BEFORE importing the script so its `new PrismaClient()`
// call lands on the stubbed constructor.
const findManyMock = vi.fn();
const updateMock = vi.fn();
const disconnectMock = vi.fn(async () => {});
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function (this: object) {
    return {
      ssoIdentityProvider: { findMany: findManyMock, update: updateMock },
      $disconnect: disconnectMock,
    };
  }) as unknown as new () => unknown,
}));

const TEST_KEY_HEX = '42'.repeat(32);

describe('encrypt-sso-secrets script', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = TEST_KEY_HEX;
    _resetCipherKeyCache();
    findManyMock.mockReset();
    updateMock.mockReset();
    disconnectMock.mockClear();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['SSO_SECRET_KEY'];
    else process.env['SSO_SECRET_KEY'] = saved;
    _resetCipherKeyCache();
  });

  it('encryptOne output matches the running server\'s decryptSecret round trip', async () => {
    const { encryptOne, loadMasterKey } = await import(
      '../scripts/encrypt-sso-secrets'
    );
    const key = loadMasterKey();
    const ct = encryptOne('legacy-plaintext-secret', key);
    expect(ct.startsWith('enc:v1:')).toBe(true);
    // The decryption helper from server/src/lib/secret-cipher must round-trip
    // ciphertext produced by the migration script — same algorithm + format.
    expect(decryptSecret(ct)).toBe('legacy-plaintext-secret');
  });

  it('isEncrypted matches the on-the-wire prefix', async () => {
    const { isEncrypted } = await import('../scripts/encrypt-sso-secrets');
    expect(isEncrypted('enc:v1:abc')).toBe(true);
    expect(isEncrypted('-----BEGIN CERTIFICATE-----')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it('run encrypts plaintext rows and skips already-encrypted rows', async () => {
    findManyMock.mockResolvedValue([
      // Row 1: plaintext SAML cert + plaintext OIDC secret (both should encrypt).
      {
        id: 'idp-1',
        institutionId: 'inst-1',
        protocol: 'SAML',
        samlCert: '-----BEGIN CERTIFICATE-----\nplaintext\n-----END CERTIFICATE-----',
        oidcClientSecret: 'plaintext-secret',
      },
      // Row 2: already encrypted samlCert + null oidcClientSecret (no-op).
      {
        id: 'idp-2',
        institutionId: 'inst-2',
        protocol: 'SAML',
        samlCert: 'enc:v1:somealreadyencryptedblob',
        oidcClientSecret: null,
      },
      // Row 3: empty samlCert (OIDC tenant) + plaintext oidcClientSecret.
      {
        id: 'idp-3',
        institutionId: 'inst-3',
        protocol: 'OIDC',
        samlCert: null,
        oidcClientSecret: 'another-plaintext',
      },
    ]);
    updateMock.mockResolvedValue({});

    const { run } = await import('../scripts/encrypt-sso-secrets');
    const stats = await run({ dryRun: false });

    expect(stats.scanned).toBe(3);
    expect(stats.touched).toBe(2);
    expect(stats.samlCertsEncrypted).toBe(1);
    expect(stats.oidcSecretsEncrypted).toBe(2);
    expect(stats.alreadyEncrypted).toBe(1);

    // Row 1 should be a single update with both fields set.
    const row1Call = updateMock.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === 'idp-1',
    );
    const row1Data = (row1Call?.[0] as { data: { samlCert?: string; oidcClientSecret?: string } }).data;
    expect(row1Data.samlCert?.startsWith('enc:v1:')).toBe(true);
    expect(row1Data.oidcClientSecret?.startsWith('enc:v1:')).toBe(true);

    // Row 2 must not be touched at all.
    const row2Call = updateMock.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === 'idp-2',
    );
    expect(row2Call).toBeUndefined();
  });

  it('--dry-run reports the same counts but performs zero updates', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'idp-1',
        institutionId: 'inst-1',
        protocol: 'OIDC',
        samlCert: null,
        oidcClientSecret: 'plaintext',
      },
    ]);

    const { run } = await import('../scripts/encrypt-sso-secrets');
    const stats = await run({ dryRun: true });

    expect(stats.touched).toBe(1);
    expect(stats.oidcSecretsEncrypted).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to run when SSO_SECRET_KEY is unset', async () => {
    delete process.env['SSO_SECRET_KEY'];
    _resetCipherKeyCache();

    const { run } = await import('../scripts/encrypt-sso-secrets');
    await expect(run({ dryRun: true })).rejects.toThrowError(/SSO_SECRET_KEY is not set/);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
