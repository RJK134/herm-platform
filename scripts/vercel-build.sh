#!/usr/bin/env bash
# Vercel build orchestrator — extracted from vercel.json's `buildCommand`
# because the inline form crossed Vercel's 256-character schema limit
# once the production-gated `prisma migrate deploy` step was added.
#
# Steps, in order:
#   1. Generate the Prisma client against prisma/schema.prisma. Needed
#      every build because Vercel cache doesn't carry .prisma/client
#      reliably across the workspace boundary.
#   2. On production deploys only, apply pending Prisma migrations to
#      the configured DATABASE_URL. Preview deploys are intentionally
#      skipped — Vercel previews typically share the prod DATABASE_URL
#      unless a separate preview branch is wired, and we don't want a
#      preview push to mutate the prod schema.
#   3. Compile the server (tsc) and bundle the client (vite). Order
#      matters: api/[...slug].ts statically imports server/dist/* at
#      runtime, so the server build must complete first.
#
# A failure at any step aborts the deploy — by design. Better to refuse
# the deploy than ship a binary that can't read its own tables.

set -euo pipefail

echo "[vercel-build] prisma generate"
npx prisma generate --schema=prisma/schema.prisma

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "[vercel-build] prisma migrate deploy (production)"
  npx prisma migrate deploy --schema=prisma/schema.prisma
else
  echo "[vercel-build] skipping migrate deploy (VERCEL_ENV=${VERCEL_ENV:-<unset>})"
fi

echo "[vercel-build] server build"
npm run build --workspace=@herm-platform/server

echo "[vercel-build] client build"
npm run build --workspace=@herm-platform/client
