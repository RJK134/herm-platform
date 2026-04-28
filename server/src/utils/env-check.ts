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
  { name: 'FRONTEND_URL',          required: false, description: 'Frontend origin for CORS (defaults to localhost:5173)' },
  { name: 'ANTHROPIC_API_KEY',     required: false, description: 'Anthropic API key for AI chat feature' },
  { name: 'STRIPE_SECRET_KEY',     required: false, description: 'Stripe secret key for subscription billing' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Stripe webhook secret for payment event verification' },
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
