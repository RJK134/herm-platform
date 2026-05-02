/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_BILLING_PORTAL_URL?: string;
  // Absolute origin of the API service for split-origin deploys
  // (Vercel SPA → Railway / Fly API). NO trailing slash, NO `/api` suffix.
  // When unset, the SPA assumes single-origin and uses relative `/api/*`.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
