/**
 * Per-tenant SAML 2.0 helper (Phase 10.10).
 *
 * Wraps `@node-saml/node-saml` with HERM's deployment defaults so the
 * controller never has to remember which validations to enable. One
 * `SAML` instance is built per request from the tenant's stored config —
 * the IdP's entityId, SSO URL, and signing cert come out of Postgres,
 * the SP-side config (entityId + ACS URL) comes from sso-config.ts.
 *
 * Validations in force:
 *   - Signed assertions required (`wantAssertionsSigned: true`).
 *   - Issuer matched against the stored IdP entityId.
 *   - Audience matched against our SP entityId.
 *   - NotBefore / NotOnOrAfter with 5s clock skew.
 *   - InResponseTo NOT validated — that requires a shared replay cache;
 *     deferred until we wire one. Replay is bounded by the assertion's
 *     own expiry window in the meantime.
 *
 * AuthnRequests are UNSIGNED in v1 — sufficient for IdPs that accept
 * unsigned requests over HTTP-Redirect. UKAMF-compliant deployments
 * will need to add `privateKey` + `publicCert` from a per-deployment
 * X.509 keypair; deferred.
 */
import { SAML, ValidateInResponseTo, type SamlConfig } from '@node-saml/node-saml';
import { getSamlAcsUrl, getSpEntityId } from '../../lib/sso-config';

export interface TenantSamlConfig {
  /** IdP's entityID (e.g. `https://idp.example.ac.uk/saml/idp`). */
  samlEntityId: string;
  /** IdP's HTTP-Redirect SSO URL. */
  samlSsoUrl: string;
  /** IdP's X.509 signing certificate (PEM string). */
  samlCert: string;
}

function buildSaml(institutionSlug: string, idp: TenantSamlConfig): SAML {
  const config: SamlConfig = {
    entryPoint: idp.samlSsoUrl,
    idpIssuer: idp.samlEntityId,
    idpCert: idp.samlCert,
    issuer: getSpEntityId(),
    callbackUrl: getSamlAcsUrl(institutionSlug),
    audience: getSpEntityId(),
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.never,
    acceptedClockSkewMs: 5000,
  };
  return new SAML(config);
}

/**
 * Build the URL the user-agent should be 302'd to so they can
 * authenticate at the IdP. The `relayState` round-trips back to the
 * ACS — we use it to carry the institution slug so the ACS can re-load
 * config without trusting any field in the SAMLResponse to do it.
 */
export async function buildAuthnRequestUrl(
  institutionSlug: string,
  idp: TenantSamlConfig,
): Promise<string> {
  const saml = buildSaml(institutionSlug, idp);
  // node-saml's signature is (relayState, host, options). The host
  // argument is only consulted for a niche signing path we don't
  // exercise — undefined is fine.
  return saml.getAuthorizeUrlAsync(institutionSlug, undefined, {});
}

export interface SamlAssertion {
  email: string;
  name?: string;
}

/**
 * Validate a POST-binding SAMLResponse and return the verified subject
 * attributes. Throws on signature / Issuer / Audience / expiry failures
 * with the library's plain `Error` message.
 *
 * Callers should wrap with a try/catch and surface 401 to the browser
 * — never echo the underlying message back, since it can leak details
 * that help an attacker iterate (e.g. "Invalid signature" vs "Audience
 * mismatch").
 */
export async function validateSamlResponse(
  institutionSlug: string,
  idp: TenantSamlConfig,
  samlResponseB64: string,
): Promise<SamlAssertion> {
  const saml = buildSaml(institutionSlug, idp);
  const { profile, loggedOut } = await saml.validatePostResponseAsync({
    SAMLResponse: samlResponseB64,
  });
  if (!profile || loggedOut) {
    throw new Error('SAML response did not yield a profile');
  }
  const email = profile.nameID;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('SAML profile missing usable NameID (expected email)');
  }
  const attrs = (profile.attributes ?? {}) as Record<string, unknown>;
  const rawName = attrs['displayName'] ?? attrs['name'] ?? attrs['cn'];
  const name = typeof rawName === 'string' ? rawName : undefined;
  return { email, name };
}
