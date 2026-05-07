// Vercel serverless entry — mounts the entire compiled Express app on a
// single catch-all function. `[...path]` matches /api/* so the Express
// router inside `createApp()` keeps doing its own routing unchanged.
//
// Imports the *compiled* server (server/dist) rather than the TS source so
// the Vercel @vercel/node bundler sees plain CJS — this avoids ts-node
// transpiling each file with the wrong tsconfig (server is module:commonjs,
// the api/ entry is ESM-resolution by default).
//
// `bodyParser: false` lets Express's own express.json() / express.urlencoded()
// run instead of Vercel's preprocessor (would otherwise double-parse and
// strip raw bodies needed by the Stripe webhook signature check).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('../server/dist/app.js');

const app = createApp();

export const config = {
  api: { bodyParser: false },
};

export default function handler(req: unknown, res: unknown): void {
  (app as (r: unknown, s: unknown) => void)(req, res);
}
