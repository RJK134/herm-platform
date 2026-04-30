import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSpSigningMaterial, _resetSpSigningCache } from './sp-signing';

// Fixture PEMs — these are NOT real keypairs, just shape-valid strings the
// PEM-header sniffer accepts. node-saml itself does not parse them in this
// test file (we never call into the SAML library here); the unit under test
// only validates the headers and returns the buffers verbatim.
const FAKE_KEY_PEM =
  '-----BEGIN PRIVATE KEY-----\nfake-private-key-bytes\n-----END PRIVATE KEY-----';
const FAKE_CERT_PEM =
  '-----BEGIN CERTIFICATE-----\nfake-certificate-bytes\n-----END CERTIFICATE-----';

describe('sp-signing', () => {
  let savedKey: string | undefined;
  let savedCert: string | undefined;

  beforeEach(() => {
    savedKey = process.env['SP_SIGNING_KEY'];
    savedCert = process.env['SP_SIGNING_CERT'];
    delete process.env['SP_SIGNING_KEY'];
    delete process.env['SP_SIGNING_CERT'];
    _resetSpSigningCache();
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env['SP_SIGNING_KEY'];
    else process.env['SP_SIGNING_KEY'] = savedKey;
    if (savedCert === undefined) delete process.env['SP_SIGNING_CERT'];
    else process.env['SP_SIGNING_CERT'] = savedCert;
    _resetSpSigningCache();
  });

  it('returns null when neither env var is set (legacy unsigned path)', () => {
    expect(getSpSigningMaterial()).toBeNull();
  });

  it('throws when only SP_SIGNING_KEY is set', () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY_PEM;
    expect(() => getSpSigningMaterial()).toThrowError(/both be set, or both unset/);
  });

  it('throws when only SP_SIGNING_CERT is set', () => {
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    expect(() => getSpSigningMaterial()).toThrowError(/both be set, or both unset/);
  });

  it('returns the materialised pair when both inline PEMs are set', () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY_PEM;
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    const m = getSpSigningMaterial();
    expect(m?.privateKey).toBe(FAKE_KEY_PEM);
    expect(m?.publicCert).toBe(FAKE_CERT_PEM);
  });

  it('expands literal "\\n" inside an env value into real newlines', () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY_PEM.replace(/\n/g, '\\n');
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    const m = getSpSigningMaterial();
    expect(m?.privateKey).toContain('-----BEGIN PRIVATE KEY-----\nfake');
  });

  it('reads from disk when an env var is "file:/path"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'herm-sp-'));
    const keyPath = join(dir, 'key.pem');
    const certPath = join(dir, 'cert.pem');
    writeFileSync(keyPath, FAKE_KEY_PEM, 'utf8');
    writeFileSync(certPath, FAKE_CERT_PEM, 'utf8');
    try {
      process.env['SP_SIGNING_KEY'] = `file:${keyPath}`;
      process.env['SP_SIGNING_CERT'] = `file:${certPath}`;
      const m = getSpSigningMaterial();
      expect(m?.privateKey).toBe(FAKE_KEY_PEM);
      expect(m?.publicCert).toBe(FAKE_CERT_PEM);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects values that do not look like PEM private keys', () => {
    process.env['SP_SIGNING_KEY'] = 'not a key';
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    expect(() => getSpSigningMaterial()).toThrowError(/SP_SIGNING_KEY does not look like a PEM/);
  });

  it('rejects values that do not look like PEM certificates', () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY_PEM;
    process.env['SP_SIGNING_CERT'] = 'not a cert';
    expect(() => getSpSigningMaterial()).toThrowError(/SP_SIGNING_CERT does not look like a PEM/);
  });

  it('throws a clear error when "file:" path is unreadable', () => {
    process.env['SP_SIGNING_KEY'] = 'file:/nonexistent/path/key.pem';
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    expect(() => getSpSigningMaterial()).toThrowError(/SP_SIGNING_KEY=file:.*could not be read/);
  });

  it('caches the result across calls', () => {
    process.env['SP_SIGNING_KEY'] = FAKE_KEY_PEM;
    process.env['SP_SIGNING_CERT'] = FAKE_CERT_PEM;
    const a = getSpSigningMaterial();
    process.env['SP_SIGNING_KEY'] = 'mutated-but-cache-still-honoured';
    const b = getSpSigningMaterial();
    expect(b).toBe(a); // same reference; cache held
  });
});
