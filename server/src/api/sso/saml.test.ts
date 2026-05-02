/**
 * Phase 11.16 — Unit tests for `extractNotOnOrAfter`.
 *
 * Pins the regex contract that bounds the SLO replay-cache TTL by the
 * LogoutRequest's `NotOnOrAfter` attribute. Copilot review on PR #80
 * flagged that the surrounding integration tests in `saml-slo.test.ts`
 * mock node-saml entirely and so never exercise the inflate + regex
 * path — `SAMLRequest=base64encoded` is a placeholder that fails to
 * inflate, returning undefined. These tests feed real deflated +
 * base64-encoded LogoutRequest payloads so the regex is actually
 * exercised, and assert both quote styles work (XML allows either).
 */
import { describe, it, expect } from 'vitest';
import { promisify } from 'node:util';
import { deflateRaw } from 'node:zlib';
import { extractNotOnOrAfter } from './saml';

const deflateRawAsync = promisify(deflateRaw);

/**
 * Build a redirect-binding `SAMLRequest` payload from a LogoutRequest XML
 * string: deflate (raw, no zlib header) then base64-encode. This is the
 * exact wire shape an IdP produces for SAML 2.0 HTTP-Redirect logout.
 */
async function buildSamlRequestParam(xml: string): Promise<string> {
  const deflated = await deflateRawAsync(Buffer.from(xml, 'utf8'));
  return deflated.toString('base64');
}

const NAMEID_FRAGMENT =
  '<saml:NameID xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">alice@example.test</saml:NameID>';

describe('extractNotOnOrAfter', () => {
  it('extracts a double-quoted NotOnOrAfter from a real deflated+base64 LogoutRequest', async () => {
    const xml = `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_id-1" Version="2.0" NotOnOrAfter="2026-05-01T12:30:00Z">${NAMEID_FRAGMENT}</samlp:LogoutRequest>`;
    const SAMLRequest = await buildSamlRequestParam(xml);
    const out = await extractNotOnOrAfter({ SAMLRequest });
    expect(out).toBe('2026-05-01T12:30:00Z');
  });

  it('extracts a single-quoted NotOnOrAfter (Phase 11.16 — XML allows either quote style)', async () => {
    // Before the regex fix, this fell through to undefined and the
    // replay cache used the default 300s TTL even when the IdP intended
    // a shorter window (or vice versa).
    const xml = `<samlp:LogoutRequest xmlns:samlp='urn:oasis:names:tc:SAML:2.0:protocol' ID='_id-2' Version='2.0' NotOnOrAfter='2026-05-01T12:45:00Z'>${NAMEID_FRAGMENT}</samlp:LogoutRequest>`;
    const SAMLRequest = await buildSamlRequestParam(xml);
    const out = await extractNotOnOrAfter({ SAMLRequest });
    expect(out).toBe('2026-05-01T12:45:00Z');
  });

  it('returns undefined when NotOnOrAfter is absent from the XML', async () => {
    const xml = `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_id-3" Version="2.0">${NAMEID_FRAGMENT}</samlp:LogoutRequest>`;
    const SAMLRequest = await buildSamlRequestParam(xml);
    const out = await extractNotOnOrAfter({ SAMLRequest });
    expect(out).toBeUndefined();
  });

  it('returns undefined when SAMLRequest is missing from the query', async () => {
    expect(await extractNotOnOrAfter({})).toBeUndefined();
  });

  it('returns undefined when SAMLRequest is an empty string', async () => {
    expect(await extractNotOnOrAfter({ SAMLRequest: '' })).toBeUndefined();
  });

  it('returns undefined when SAMLRequest is non-string (defensive)', async () => {
    expect(await extractNotOnOrAfter({ SAMLRequest: 12345 })).toBeUndefined();
    expect(await extractNotOnOrAfter({ SAMLRequest: null })).toBeUndefined();
    expect(await extractNotOnOrAfter({ SAMLRequest: { foo: 'bar' } })).toBeUndefined();
  });

  it('returns undefined when the payload is base64 garbage (inflate throws)', async () => {
    // Random base64 that doesn't decode to a valid deflate stream.
    expect(await extractNotOnOrAfter({ SAMLRequest: 'AAAA' })).toBeUndefined();
  });

  it('returns undefined when the payload is non-base64 garbage', async () => {
    // Base64-decoding doesn't throw on garbage (it produces a buffer of
    // some length), but the subsequent inflate fails — that's the path
    // the catch block protects.
    expect(await extractNotOnOrAfter({ SAMLRequest: 'not-base64-!!!' })).toBeUndefined();
  });

  it('handles attribute names case-insensitively (defensive)', async () => {
    // The regex has the /i flag — XML attribute names are technically
    // case-sensitive, but defending against a mis-cased IdP payload
    // is cheap and prevents a fall-through to default TTL.
    const xml = `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_id-4" Version="2.0" notonorafter="2026-05-01T13:00:00Z">${NAMEID_FRAGMENT}</samlp:LogoutRequest>`;
    const SAMLRequest = await buildSamlRequestParam(xml);
    const out = await extractNotOnOrAfter({ SAMLRequest });
    expect(out).toBe('2026-05-01T13:00:00Z');
  });
});
