/**
 * In-process SAML test IdP for the Phase 11.6 live integration tests.
 *
 * `node-saml` (the SP-side library HERM uses) is asymmetric: it knows
 * how to validate a signed assertion, not how to produce one. This
 * helper closes that gap with `xml-crypto`'s `SignedXml` so we can hand
 * the real `validateSamlResponse` a real signed assertion built in
 * the test process — no external IdP, no Docker, no tunnels.
 *
 * The cert and key are generated once per `createSamlTestIdp()` call.
 * Tests pin `samlCert` on their `SsoIdentityProvider` mock to the same
 * PEM the helper used to sign, so the SP can verify against it.
 */
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { SignedXml } from 'xml-crypto';

export interface SamlTestIdp {
  /** PEM-encoded X.509 certificate (the IdP's signing cert). */
  cert: string;
  /** SAML entityID HERM should pin under `idpIssuer` / `samlEntityId`. */
  entityId: string;
  /** Builds a signed `<samlp:Response>` XML for a given subject. */
  buildSamlResponse(opts: {
    spEntityId: string;
    acsUrl: string;
    nameId: string;
    attributes?: Record<string, string>;
    inResponseTo?: string | null;
  }): string;
}

/**
 * Build a self-signed X.509 cert in PEM form. Generated entirely
 * in-process so the test never touches the filesystem.
 */
function selfSignedCertPem(publicKey: KeyObject): string {
  // node-saml accepts a "raw" PEM CERTIFICATE wrapper around a SubjectPublicKeyInfo
  // (SPKI) blob via xml-crypto's signature verification. xml-crypto's
  // `signatureAlgorithm: 'RSA-SHA256'` mode references the PEM cert by
  // base64-encoding its DER bytes inside a <X509Certificate> element.
  //
  // node-saml accepts *just* the SPKI public key as `idpCert` too.
  // That's the simpler path — we hand over the public key in PEM form
  // (BEGIN PUBLIC KEY), which is exactly what `idpCert` already is in
  // production deployments that paste a PEM into the admin form.
  const spki = publicKey.export({ format: 'pem', type: 'spki' });
  return spki.toString();
}

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString();
}

function randomId(prefix = 'id-'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createSamlTestIdp(opts?: { entityId?: string }): SamlTestIdp {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicPem = selfSignedCertPem(publicKey);

  const entityId = opts?.entityId ?? 'https://idp.test/saml/idp';

  function buildSamlResponse(args: {
    spEntityId: string;
    acsUrl: string;
    nameId: string;
    attributes?: Record<string, string>;
    inResponseTo?: string | null;
  }): string {
    const responseId = randomId('R-');
    const assertionId = randomId('A-');
    const issueInstant = nowIso();
    const notBefore = nowIso(-30);
    const notOnOrAfter = nowIso(300); // 5 min
    const inResp = args.inResponseTo ? ` InResponseTo="${escapeXml(args.inResponseTo)}"` : '';

    const attrs = args.attributes
      ? Object.entries(args.attributes)
          .map(
            ([k, v]) =>
              `<saml:Attribute Name="${escapeXml(k)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${escapeXml(v)}</saml:AttributeValue></saml:Attribute>`,
          )
          .join('')
      : '';

    // The Assertion is the signed element. node-saml's
    // `wantAssertionsSigned: true` requires the signature to wrap the
    // <Assertion>, not just the outer <Response>.
    const assertionXml =
      `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" Version="2.0" ID="${assertionId}" IssueInstant="${issueInstant}">` +
      `<saml:Issuer>${escapeXml(entityId)}</saml:Issuer>` +
      `<saml:Subject>` +
      `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${escapeXml(args.nameId)}</saml:NameID>` +
      `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
      `<saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${escapeXml(args.acsUrl)}"${inResp}/>` +
      `</saml:SubjectConfirmation>` +
      `</saml:Subject>` +
      `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
      `<saml:AudienceRestriction><saml:Audience>${escapeXml(args.spEntityId)}</saml:Audience></saml:AudienceRestriction>` +
      `</saml:Conditions>` +
      `<saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="${randomId('S-')}">` +
      `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
      `</saml:AuthnStatement>` +
      `<saml:AttributeStatement>${attrs}</saml:AttributeStatement>` +
      `</saml:Assertion>`;

    // Sign the assertion with xml-crypto. The signature is enveloped
    // inside the assertion (RFC 2807 / SAML 2.0 core §5.4).
    const sig = new SignedXml({
      privateKey: privatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    });
    sig.addReference({
      xpath: "//*[local-name()='Assertion']",
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
    });
    sig.computeSignature(assertionXml, {
      location: { reference: "//*[local-name()='Assertion']/*[local-name()='Issuer']", action: 'after' },
    });
    const signedAssertion = sig.getSignedXml();

    // Wrap in the outer Response. node-saml only requires the
    // assertion to be signed (`wantAssertionsSigned`), not the
    // response itself, so we leave the outer envelope unsigned.
    const responseXml =
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" Version="2.0" ID="${responseId}" IssueInstant="${issueInstant}" Destination="${escapeXml(args.acsUrl)}"${inResp}>` +
      `<saml:Issuer>${escapeXml(entityId)}</saml:Issuer>` +
      `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
      signedAssertion +
      `</samlp:Response>`;

    return responseXml;
  }

  return {
    cert: publicPem,
    entityId,
    buildSamlResponse,
  };
}
