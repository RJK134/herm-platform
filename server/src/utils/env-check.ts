/**
 * Production environment validation.
 * Called once at startup — throws if required vars are missing in production,
 * warns in development so the developer knows what to configure.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { name: 'DATABASE_URL',          required: true,  description: 'PostgreSQL connection string' },
  { name: 'JWT_SECRET',            required: true,  description: 'JWT signing secret (min 32 chars recommended)' },
  { name: 'FRONTEND_URL',          required: false, description: 'Browser-facing origin (CORS + SSO post-login redirect). REQUIRED in production — see prod-only check below.' },
  { name: 'SP_BASE_URL',           required: false, description: 'API origin used for SAML ACS + OIDC callback URLs (Phase 10.10). REQUIRED in production — see prod-only check below.' },
  { name: 'SSO_SECRET_KEY',        required: false, description: 'Master key (32 bytes; 64 hex chars or base64) used to envelope-encrypt SsoIdentityProvider.samlCert + .oidcClientSecret at rest. Required when SSO is in use; warned-on in production when missing.' },
  { name: 'ANTHROPIC_API_KEY',     required: false, description: 'Anthropic API key for AI chat feature' },
  { name: 'STRIPE_SECRET_KEY',     required: false, description: 'Stripe secret key for subscription billing' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Stripe webhook secret for payment event verification' },
  { name: 'REDIS_URL',             required: false, description: 'Redis connection string (e.g. redis://localhost:6379) — enables the Redis readiness probe when set; shared rate-limit / session state is not yet implemented' },
  { name: 'SMTP_HOST',             required: false, description: 'SMTP server host for outbound email (billing notifications etc.)' },
  { name: 'SMTP_FROM',             required: false, description: 'Default From: address for outbound email (e.g. "HERM <noreply@example.com>")' },
];

export function checkEnvironment(): void {
  const isProd = process.env['NODE_ENV'] === 'production';
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    if (!value) {
      if (v.required) {
        missing.push(`  ${v.name} — ${v.description}`);
      } else {
        warnings.push(`  ${v.name} — ${v.description}`);
      }
    }
  }

  // Warn about JWT_SECRET strength even if set
  const jwtSecret = process.env['JWT_SECRET'];
  if (jwtSecret && jwtSecret.length < 32) {
    const msg = '  JWT_SECRET is shorter than 32 characters — use a longer random value in production';
    if (isProd) missing.push(msg);
    else warnings.push(msg);
  }

  // Stripe: if billing is configured (STRIPE_SECRET_KEY) but the webhook
  // secret is missing, every webhook delivery silently no-ops (the
  // service short-circuits without verifying signatures). That state is
  // unsafe — Stripe will think the events were ack'd and stop retrying,
  // and our DB will diverge from the source of truth. Fail loudly so the
  // operator notices before real customers transact.
  if (process.env['STRIPE_SECRET_KEY'] && !process.env['STRIPE_WEBHOOK_SECRET']) {
    const msg =
      '  STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — webhook signature verification cannot run, and every Stripe event will silently no-op. Set STRIPE_WEBHOOK_SECRET (from https://dashboard.stripe.com/webhooks).';
    if (isProd) missing.push(msg);
    else warnings.push(msg);
  }

  // SMTP coherence: if SMTP_HOST is set, the operator clearly intends to
  // send mail — but a host alone is not enough. Without SMTP_FROM (or
  // SMTP_USER as a fallback) the email path silently disables itself,
  // which means dunning notifications won't reach paying customers. Fail
  // loudly in production, warn in dev. Mirrors the Stripe-pair check above.
  if (process.env['SMTP_HOST']) {
    if (!process.env['SMTP_FROM'] && !process.env['SMTP_USER']) {
      const msg =
        '  SMTP_HOST is set but neither SMTP_FROM nor SMTP_USER is configured — outbound email will be silently disabled. Set SMTP_FROM (e.g. "HERM <noreply@your-domain>") and authentication credentials.';
      if (isProd) missing.push(msg);
      else warnings.push(msg);
    }
    const portStr = process.env['SMTP_PORT'];
    if (portStr !== undefined) {
      const port = Number.parseInt(portStr, 10);
      if (!Number.isFinite(port) || port <= 0 || port > 65535) {
        const msg = `  SMTP_PORT="${portStr}" is not a valid port number (1-65535).`;
        if (isProd) missing.push(msg);
        else warnings.push(msg);
      }
    }
  }

  // SSO requires both browser- and API-facing origins explicitly in
  // production. Without them, sso-config.ts falls back to localhost
  // dev defaults — which would mint SAML/OIDC callback URLs and a
  // post-SSO redirect (carrying the session JWT) that point at
  // origins the production user-agent can't reach. The runtime throw
  // in sso-config is defence-in-depth; this is the loud-at-boot
  // version so a misconfigured deploy never starts.
  if (isProd && !process.env['FRONTEND_URL']) {
    missing.push(
      '  FRONTEND_URL is required in production. Without it the post-SSO redirect (which carries the session JWT) would 302 to localhost:5173 — leaking the token into an unintended browser context. Set to the public SPA origin (e.g. https://app.example.ac.uk).',
    );
  }
  if (isProd && !process.env['SP_BASE_URL']) {
    missing.push(
      '  SP_BASE_URL is required in production. Without it the SAML ACS + OIDC callback URLs sent to IdPs would point at localhost:3002 — IdPs would redirect users to an unreachable origin and SSO would silently break. Set to the public API origin (e.g. https://api.example.ac.uk).',
    );
  }

  // SSO_SECRET_KEY: warn-only at boot. Not fatal even in production —
  // a deployment that does not use SSO at all has no rows to encrypt
  // and runs fine without the key. The encrypt/decrypt helpers throw
  // at runtime when an actual SSO row is read or written without the
  // key, which is the right place to fail (per-tenant, not at boot).
  if (isProd && !process.env['SSO_SECRET_KEY']) {
    console.warn(
      '[ENV] SSO_SECRET_KEY is not set. Any encrypted SsoIdentityProvider row will fail to load, and the SSO admin write path will refuse to persist new secrets in plaintext. Generate one with: openssl rand -hex 32',
    );
  }

  // Shout if the pre-billing tier-unlock flag is set in production.
  // Not fatal — there are legitimate staging-as-production uses — but loud.
  if (isProd && process.env['DEV_UNLOCK_ALL_TIERS'] === 'true') {
    console.error(
      '[ENV] ⚠  DEV_UNLOCK_ALL_TIERS=true in production — every logged-in user will behave as Enterprise. Unset before real customers land.',
    );
  }

  // DB resilience: prisma.ts applies safe defaults (connection_limit=10,
  // statement_timeout=15s via libpq `options=-c`). In production, surface
  // a one-line nudge if the operator hasn't set these explicitly so they
  // know which knobs exist. Silent in dev — defaults are fine there.
  if (isProd) {
    const dbUrl = process.env['DATABASE_URL'];
    if (dbUrl) {
      try {
        const u = new URL(dbUrl);
        const hasPoolLimit = u.searchParams.has('connection_limit');
        const hasOptions = u.searchParams.has('options');
        if (!hasPoolLimit || !hasOptions) {
          const knobs = [
            !hasPoolLimit ? 'connection_limit' : null,
            !hasOptions ? 'options (e.g. -c statement_timeout=15000)' : null,
          ]
            .filter(Boolean)
            .join(', ');
          console.warn(
            `[ENV] DATABASE_URL has no ${knobs}; relying on app defaults from prisma.ts. Override per environment by adding query params to DATABASE_URL.`,
          );
        }
      } catch {
        // env-check above already complained about an unparseable URL.
      }
    }
  }

  if (missing.length > 0) {
    const header = isProd
      ? '[ENV] FATAL: required environment variables not set:'
      : '[ENV] WARNING: required environment variables not set (server will use insecure defaults):';
    console.error(header);
    missing.forEach(m => console.error(m));
    if (isProd) {
      throw new Error('Missing required environment variables — see above');
    }
  }

  if (warnings.length > 0) {
    console.warn('[ENV] Optional environment variables not set (some features may be unavailable):');
    warnings.forEach(w => console.warn(w));
  }
}
