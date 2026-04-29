# syntax=docker/dockerfile:1.7
#
# Future Horizons ASPT — production server image.
#
# Multi-stage build:
#   1. `deps`     — npm ci with build-time tooling, generate the Prisma client
#   2. `builder`  — compile the server (tsc) using the deps tree
#   3. `runner`   — minimal alpine, non-root, with only the artefacts needed
#                   to run the server in production
#
# The runner image holds the compiled server bundle, the Prisma client, the
# migrations directory (so `db:migrate:deploy` can run from inside the
# container), and a small set of runtime npm packages. Source TypeScript,
# tests, the client SPA, and dev-only tooling are excluded.
#
# Build:    docker build -t herm-platform:<tag> .
# Run:      docker run --rm -p 3002:3002 \
#             -e NODE_ENV=production \
#             -e DATABASE_URL=... \
#             -e JWT_SECRET=... \
#             -e FRONTEND_URL=... \
#             herm-platform:<tag>
# Health:   curl http://localhost:3002/api/health  → 200
#           container's HEALTHCHECK exercises the same path every 30s.

# ─────────────────────────────────────────────────────────────────────────────
# 1. deps — install everything (incl. dev) so the build can run, then prune
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# OpenSSL is a hard requirement for the Prisma engine binaries on Alpine.
# Without it, `prisma generate` produces a binary that segfaults at boot.
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund

# Generate the Prisma client against the schema. We need this in BOTH the
# builder (so tsc can resolve `@prisma/client` types) and the runner (so the
# query engine binary is present). Generated under server/node_modules.
COPY prisma ./prisma
RUN npx prisma generate --schema=prisma/schema.prisma

# ─────────────────────────────────────────────────────────────────────────────
# 2. builder — compile TypeScript → JavaScript
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Server source. The client dist is served separately (CDN / static host) so
# we deliberately don't copy the client tree into the server image — keeps
# the image small and the deployment surfaces independent.
COPY server ./server

# tsc emits to server/dist (uses server/tsconfig.json)
RUN npm run build --workspace=server

# ─────────────────────────────────────────────────────────────────────────────
# 3. runner — minimal runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL again — Prisma needs it at runtime, not just build time. wget is
# already present in alpine base; we use it for the HEALTHCHECK below.
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production \
    PORT=3002 \
    HOST=0.0.0.0 \
    NPM_CONFIG_LOGLEVEL=warn

# Re-install ONLY production dependencies in the runtime image. This shrinks
# the image dramatically vs. copying the whole node_modules tree from `deps`
# (which carries vitest, eslint, tsx, etc.).
#
# IMPORTANT: the root package.json declares `"workspaces": ["client",
# "server"]`, so npm needs BOTH workspace manifests to validate the
# lockfile and resolve the workspace tree — even though we don't ship
# any client artefacts at runtime. Excluding `client/package.json` here
# fails npm with a workspace-resolution error.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/

# Install production deps + a pinned `prisma` CLI. The CLI is normally a
# devDependency (so `npm ci --omit=dev` would prune it), but the runner
# image legitimately needs it for `db:migrate:deploy` from inside the
# container — and we must not have it download at runtime in air-gapped
# or network-restricted environments.
#
# Version comes FROM the lockfile (the resolved @prisma/client version)
# rather than a hardcoded ARG, so a routine `npm update` that bumps
# @prisma/client (e.g. 5.22.0 → 5.25.0) keeps the CLI and client in
# lockstep — Prisma requires the CLI and client to agree on the engine
# binary, and a mismatch produces incompatible engines that only surface
# as runtime errors in the production image.
RUN npm ci --omit=dev --no-audit --no-fund \
 && PRISMA_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/@prisma/client'].version") \
 && echo "[runner] installing prisma CLI ${PRISMA_VERSION} (matched to lockfile @prisma/client)" \
 && npm install -g --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
 && npm cache clean --force

# Copy the compiled server, the migration directory, and the schema. Schema
# is needed because `prisma migrate deploy` reads it; migrations are needed
# to apply schema changes from inside the container. Seed scripts are
# deliberately NOT copied — they require devDependencies (tsx) and are
# intended to run from a separate one-off task container, not the prod image.
COPY --from=builder /app/server/dist ./server/dist
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

# Re-generate the Prisma client in the runner. We can't simply copy node_modules
# from `deps` because `npm ci --omit=dev` above pruned the tree to production
# only — running `prisma generate` here repopulates the engine binary against
# the slimmer dependency set. Uses the globally-installed `prisma` CLI so
# this step also works at runtime under the `node` user.
RUN prisma generate --schema=prisma/schema.prisma

# Drop privileges. The `node` user (uid 1000) is part of the base image; we
# ensure the working directory and all artefacts are owned by it before
# switching.
RUN chown -R node:node /app
USER node

EXPOSE 3002

# Container-orchestrator-friendly health probe. The K8s/ECS readiness probe
# will hit /api/health independently, but a Docker HEALTHCHECK covers the
# `docker run` / docker-compose case (and gives `docker ps` visibility).
# 30s interval, 5s timeout, 3 fails → unhealthy.
#
# Uses ${PORT} (not the hardcoded 3002) so an operator who overrides
# `-e PORT=8080` at runtime gets a probe that follows the server. The
# CMD here is shell-form, so the variable is expanded by /bin/sh
# inside the container at probe time, after PORT has been set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider --tries=1 "http://localhost:${PORT:-3002}/api/health" || exit 1

# Entry point. We don't shell-form the command (no `npm start`) because that
# adds a wrapping process that intercepts SIGTERM, breaking graceful
# shutdown. `node` directly receives SIGTERM/SIGINT.
CMD ["node", "server/dist/index.js"]
