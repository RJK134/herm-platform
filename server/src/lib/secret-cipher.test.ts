import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  getMasterKey,
  _resetCipherKeyCache,
} from './secret-cipher';

// Deterministic low-entropy test keys — NOT secrets. Built from a repeating
// byte pattern so secret-scanners (GitGuardian, trufflehog) don't flag them.
// Each is 32 bytes / 64 hex chars, the size aes-256-gcm requires.
const TEST_KEY_HEX = '42'.repeat(32);
const OTHER_KEY_HEX = '99'.repeat(32);

describe('secret-cipher', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env['SSO_SECRET_KEY'];
    process.env['SSO_SECRET_KEY'] = TEST_KEY_HEX;
    _resetCipherKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env['SSO_SECRET_KEY'];
    } else {
      process.env['SSO_SECRET_KEY'] = originalKey;
    }
    _resetCipherKeyCache();
  });

  describe('isEncryptedSecret', () => {
    it('detects the enc:v1: prefix', () => {
      expect(isEncryptedSecret('enc:v1:somebase64==')).toBe(true);
    });
    it('returns false for plaintext PEMs and OIDC secrets', () => {
      expect(isEncryptedSecret('-----BEGIN CERTIFICATE-----')).toBe(false);
      expect(isEncryptedSecret('client-secret-from-azure-ad')).toBe(false);
      expect(isEncryptedSecret('')).toBe(false);
    });
    it('returns false for null / undefined', () => {
      expect(isEncryptedSecret(null)).toBe(false);
      expect(isEncryptedSecret(undefined)).toBe(false);
    });
  });

  describe('round trip', () => {
    it('encrypts and decrypts a short OIDC client secret', () => {
      const plaintext = 'super-secret-do-not-leak';
      const ct = encryptSecret(plaintext);
      expect(ct.startsWith('enc:v1:')).toBe(true);
      expect(ct).not.toContain(plaintext);
      expect(decryptSecret(ct)).toBe(plaintext);
    });

    it('encrypts and decrypts a multi-line PEM cert', () => {
      const pem =
        '-----BEGIN CERTIFICATE-----\nMIIB...\nfake-cert-bytes\n-----END CERTIFICATE-----\n';
      const ct = encryptSecret(pem);
      expect(decryptSecret(ct)).toBe(pem);
    });

    it('produces different ciphertexts each call (random IV)', () => {
      const a = encryptSecret('same-input');
      const b = encryptSecret('same-input');
      expect(a).not.toBe(b);
      expect(decryptSecret(a)).toBe('same-input');
      expect(decryptSecret(b)).toBe('same-input');
    });
  });

  describe('idempotence', () => {
    it('encryptSecret is a no-op on already-encrypted input', () => {
      const once = encryptSecret('payload');
      const twice = encryptSecret(once);
      expect(twice).toBe(once);
      expect(decryptSecret(twice)).toBe('payload');
    });

    it('decryptSecret returns plaintext input verbatim (legacy back-compat)', () => {
      expect(decryptSecret('plaintext-row-not-yet-encrypted')).toBe(
        'plaintext-row-not-yet-encrypted',
      );
    });

    it('decryptSecret passes null / undefined through', () => {
      expect(decryptSecret(null)).toBe(null);
      expect(decryptSecret(undefined)).toBe(undefined);
    });
  });

  describe('failure modes', () => {
    it('decryption fails when the key is rotated to a different value', () => {
      const ct = encryptSecret('written-with-key-A');
      process.env['SSO_SECRET_KEY'] = OTHER_KEY_HEX;
      _resetCipherKeyCache();
      expect(() => decryptSecret(ct)).toThrowError(/Failed to decrypt SSO secret/);
    });

    it('decryption of an encrypted row fails when the key is unset', () => {
      const ct = encryptSecret('payload');
      delete process.env['SSO_SECRET_KEY'];
      _resetCipherKeyCache();
      expect(() => decryptSecret(ct)).toThrowError(/SSO_SECRET_KEY is not set/);
    });

    it('encryption refuses to run without a key', () => {
      delete process.env['SSO_SECRET_KEY'];
      _resetCipherKeyCache();
      expect(() => encryptSecret('payload')).toThrowError(/SSO_SECRET_KEY is not set/);
    });

    it('rejects malformed ciphertext', () => {
      expect(() => decryptSecret('enc:v1:not-base64!!!')).toThrow();
    });

    it('rejects truncated ciphertext (missing IV / tag)', () => {
      // Valid base64 but only 4 bytes — too short to contain IV + tag.
      expect(() => decryptSecret('enc:v1:AAAA')).toThrowError(/payload too short/);
    });

    it('rejects malformed master key with a clear message', () => {
      process.env['SSO_SECRET_KEY'] = 'not-a-valid-key';
      _resetCipherKeyCache();
      expect(() => getMasterKey()).toThrowError(/SSO_SECRET_KEY must decode to exactly 32 bytes/);
    });
  });

  describe('key encodings', () => {
    it('accepts a base64-encoded 32-byte key', () => {
      const b64 = Buffer.from(TEST_KEY_HEX, 'hex').toString('base64');
      process.env['SSO_SECRET_KEY'] = b64;
      _resetCipherKeyCache();
      const ct = encryptSecret('via-base64-key');
      expect(decryptSecret(ct)).toBe('via-base64-key');
    });
  });
});
