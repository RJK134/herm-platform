// Vercel serverless entry — mounts the entire compiled Express app on a
// single catch-all function. `[...path]` matches /api/* so the Express
// router inside `createApp()` keeps doing its own routing unchanged.
//
// `bodyParser: false` lets Express's own express.json() / express.urlencoded()
// run instead of Vercel's preprocessor (would otherwise double-parse and
// strip raw bodies needed by the Stripe webhook signature check).
//
// Default-import + destructure the CJS server bundle. Vercel ships this
// function with a package.json that inherits the repo's "type": "module",
// so the compiled .js is loaded as ESM and a top-level `require()` would
// throw.
import serverApp from '../server/dist/app.js';

const { createApp } = serverApp as unknown as { createApp: () => (req: unknown, res: unknown) => void };
const app = createApp();

export const config = {
  api: { bodyParser: false },
};

export default function handler(req: unknown, res: unknown): void {
  app(req, res);
}
