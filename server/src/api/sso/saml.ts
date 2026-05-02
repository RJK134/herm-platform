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
 * AuthnRequests are signed when the SP keypair is configured via
 * `SP_SIGNING_KEY` + `SP_SIGNING_CERT` (Phase 11.3). Without the keypair
 * the request is unsigned — sufficient for permissive IdPs but rejected
 * by federation-grade IdPs (UKAMF). See `lib/sp-signing.ts`.
 */
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';
import { SAML, ValidateInResponseTo, type SamlConfig } from '@node-saml/node-saml';
import { getSamlAcsUrl, getSpEntityId } from '../../lib/sso-config';
import { getSpSigningMaterial } from '../../lib/sp-signing';

const inflateRawAsync = promisify(inflateRaw);

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

  // Phase 11.3 — sign AuthnRequests when the SP keypair is configured.
  // Without the keypair the request goes out unsigned (legacy default).
  const signing = getSpSigningMaterial();
  if (signing) {
    config.privateKey = signing.privateKey;
    config.publicCert = signing.publicCert;
  }
  return new SAML(config);
}

/**
 * Build the URL the user-agent should be 302'd to so they can
 * authenticate at the IdP. The `relayState` round-trips back to the
 * ACS — we use it to carry the institution slug + (Phase 11.13) the
 * idpId so the ACS can re-load the EXACT IdP that issued this
 * AuthnRequest. Without the idpId in relayState, an institution with
 * multiple IdPs would always resolve the highest-priority row at ACS
 * time, validating responses with the wrong cert.
 *
 * RelayState format: `<institutionSlug>` (legacy single-IdP case) or
 * `<institutionSlug>:<idpId>` (multi-IdP). The ACS parser falls back
 * to the legacy shape when no `:` is present.
 */
export async function buildAuthnRequestUrl(
  institutionSlug: string,
  idp: TenantSamlConfig,
  idpId?: string,
): Promise<string> {
  const saml = buildSaml(institutionSlug, idp);
  const relayState = idpId ? `${institutionSlug}:${idpId}` : institutionSlug;
  // node-saml's signature is (relayState, host, options). The host
  // argument is only consulted for a niche signing path we don't
  // exercise — undefined is fine.
  return saml.getAuthorizeUrlAsync(relayState, undefined, {});
}

/**
 * Phase 11.13 — parse the RelayState value posted back to the ACS.
 * Returns `{ slug, idpId? }`. Legacy callers send just the slug; new
 * multi-IdP callers send `<slug>:<idpId>`.
 */
export function parseRelayState(
  relayState: string | undefined,
): { slug: string; idpId?: string } | null {
  if (!relayState) return null;
  const idx = relayState.indexOf(':');
  if (idx < 0) return { slug: relayState };
  return { slug: relayState.slice(0, idx), idpId: relayState.slice(idx + 1) };
}

export interface SamlAssertion {
  email: string;
  name?: string;
  /**
   * Phase 11.12 — surfaced for SAML SLO. The IdP's LogoutRequest will
   * carry the same NameID; the session store indexes by it so we can
   * find every session belonging to the subject.
   */
  samlNameId?: string;
  /** AuthnStatement SessionIndex (when present) for narrower SLO targeting. */
  samlSessionIndex?: string;
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
  const samlSessionIndex =
    typeof profile.sessionIndex === 'string' ? profile.sessionIndex : undefined;
  return { email, name, samlNameId: email, samlSessionIndex };
}

/**
 * Validate an IdP-initiated LogoutRequest delivered via HTTP-Redirect
 * binding (the common shape — UKAMF and Entra ID both use it).
 * Returns the asserted NameID + (optional) SessionIndex; the caller's
 * SLO handler then revokes every session matching that subject.
 *
 * Phase 11.15 — also surfaces `requestId` (the LogoutRequest's `ID`
 * attribute, sourced from node-saml's parsed `profile.ID`) and the
 * raw `notOnOrAfter` ISO timestamp lifted from the inflated XML so
 * the controller can scope a per-request replay cache. Replay
 * protection lives in `slo-replay-cache.ts`; this helper just exposes
 * the inputs.
 *
 * `query` should be the express `req.query` object as-is; node-saml
 * needs all of `SAMLRequest`, `RelayState`, `SigAlg`, `Signature` to
 * verify the redirect-binding signature.
 */
export async function validateLogoutRequest(
  institutionSlug: string,
  idp: TenantSamlConfig,
  query: Record<string, unknown>,
  originalQuery: string,
): Promise<{ nameId: string; sessionIndex?: string; requestId: string; notOnOrAfter?: string }> {
  const saml = buildSaml(institutionSlug, idp);
  // node-saml's `validateRedirectAsync` expects an Express ParsedQs;
  // the Record<string, unknown> shape we accept matches the runtime
  // payload (express's req.query) but TS narrows through ParsedQs.
  // Cast safely — every value we read off `result.profile` is checked
  // before use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await saml.validateRedirectAsync(query as any, originalQuery);
  const profile = result.profile;
  if (!profile || !result.loggedOut) {
    throw new Error('SAML LogoutRequest did not yield a logout profile');
  }
  const nameId = profile.nameID;
  if (!nameId || typeof nameId !== 'string') {
    throw new Error('SAML LogoutRequest missing NameID');
  }
  const requestId = typeof profile.ID === 'string' ? profile.ID : undefined;
  if (!requestId) {
    // node-saml's processValidlySignedPostRequestAsync already throws
    // when the LogoutRequest XML is missing an ID, so reaching this
    // branch indicates a contract drift in the upstream library.
    throw new Error('SAML LogoutRequest missing ID');
  }
  const sessionIndex = typeof profile.sessionIndex === 'string' ? profile.sessionIndex : undefined;
  const notOnOrAfter = await extractNotOnOrAfter(query);
  return { nameId, sessionIndex, requestId, notOnOrAfter };
}

/**
 * Extract the `NotOnOrAfter` attribute from the inflated LogoutRequest
 * XML when present. Used to bound the replay cache TTL — node-saml
 * verifies the timestamp internally but does not surface it on the
 * profile, so we re-inflate the same SAMLRequest payload (the work is
 * cheap: a few hundred bytes) and pull the attribute via regex rather
 * than a full XML parse, since we only need a single attribute value
 * and the surrounding XML has already been trust-validated upstream.
 *
 * Returns undefined when the SAMLRequest is missing, can't be inflated,
 * or carries no NotOnOrAfter — the cache then uses the default TTL.
 *
 * Phase 11.16 (Copilot review on PR #80) — the regex now matches both
 * double-quoted (`NotOnOrAfter="..."`) and single-quoted (`...='...'`)
 * attribute styles. XML allows either; some IdPs emit single quotes,
 * and the previous double-quote-only regex would silently fall back
 * to the default 300s TTL for those, opening a window where node-saml
 * still accepts the assertion but the replay cache has already
 * expired.
 *
 * Exported for direct unit testing — the surrounding `validateLogout
 * Request` integration tests mock node-saml and never exercise the
 * inflate+regex path, so this is the only way to pin the contract.
 */
export async function extractNotOnOrAfter(
  query: Record<string, unknown>,
): Promise<string | undefined> {
  const samlRequestRaw = query['SAMLRequest'];
  if (typeof samlRequestRaw !== 'string' || !samlRequestRaw) return undefined;
  try {
    const buf = Buffer.from(samlRequestRaw, 'base64');
    const inflated = (await inflateRawAsync(buf)).toString('utf8');
    // Matches `NotOnOrAfter="..."` OR `NotOnOrAfter='...'`. Captures
    // the value in either group 1 (double-quoted) or group 2 (single-
    // quoted). Only one branch fires per match.
    const match = /\bNotOnOrAfter\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(inflated);
    return match?.[1] ?? match?.[2];
  } catch {
    return undefined;
  }
}
