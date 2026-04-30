#!/usr/bin/env node
// Smoke-tests a running local demo stack:
//   1. GET /api/health   — process is up
//   2. GET /api/readiness — DB (and Redis if REDIS_URL set) reachable
//   3. POST /api/auth/login with the demo credentials — auth + DB write path
//
// Exits non-zero on any failure so it slots into demo:validate as a one-shot
// gate. Reads PORT from process.env (defaults to 3002).
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.PORT ?? '3002';
const BASE = `http://localhost:${PORT}`;
const DEMO_EMAIL = 'demo@demo-university.ac.uk';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo12345';

async function check(label, fn) {
  process.stdout.write(`• ${label} ... `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log('FAIL');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

async function fetchJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

console.log(`HERM demo validator — target ${BASE}`);

await check('GET /api/health is 200', async () => {
  const { status } = await fetchJson('/api/health');
  if (status !== 200) throw new Error(`expected 200, got ${status}`);
});

await check('GET /api/readiness is 200', async () => {
  // Give the readiness probe a brief retry window — Postgres can take a few
  // seconds to accept connections after `docker compose up`.
  for (let i = 0; i < 5; i++) {
    const { status } = await fetchJson('/api/readiness');
    if (status === 200) return;
    await sleep(2000);
  }
  throw new Error('readiness never returned 200 within ~10s');
});

await check(`POST /api/auth/login (${DEMO_EMAIL}) succeeds`, async () => {
  const { status, body } = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (status !== 200) {
    throw new Error(`expected 200, got ${status}: ${JSON.stringify(body)}`);
  }
  if (!body?.data?.token) {
    throw new Error(`response missing data.token: ${JSON.stringify(body)}`);
  }
});

if (process.exitCode) {
  console.log('\nDemo validation FAILED. Common fixes:');
  console.log('  - Server not running: npm run dev');
  console.log('  - DB not seeded: npm run db:seed');
  console.log('  - Wrong port: set PORT to match your server');
} else {
  console.log('\nAll demo checks passed.');
}
