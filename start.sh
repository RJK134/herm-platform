#!/usr/bin/env bash
# Future Horizons ASPT — start the local dev stack on Linux/macOS.
# Mirrors start.bat. See DEMO.md for the colleague-review walkthrough.
set -euo pipefail

cd "$(dirname "$0")"

echo "============================================"
echo " Future Horizons ASPT -- Starting Dev Stack"
echo "============================================"

echo "[1/5] Ensuring .env exists..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  .env created from .env.example"
else
  echo "  .env already present"
fi

echo "[2/5] Starting Docker services (PostgreSQL + Redis)..."
if command -v docker compose >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "  ERROR: neither 'docker compose' nor 'docker-compose' is on PATH." >&2
  exit 1
fi
$DC up -d

echo "[3/5] Waiting for PostgreSQL to be ready..."
RETRIES=0
until $DC exec -T postgres pg_isready -U herm -d herm_platform >/dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge 30 ]; then
    echo "  PostgreSQL did not become ready within 30s. Check '$DC logs postgres'." >&2
    exit 1
  fi
  sleep 1
done
echo "  PostgreSQL is ready."

echo "[4/5] Syncing Prisma client and schema..."
npm run db:generate
npm run db:push
echo "  If this is the first time you are starting the platform, run:"
echo "      npm run db:seed"
echo "  (in a second terminal) to populate frameworks, capabilities, vendors."

echo "[5/5] Starting development servers..."
echo "  API:    http://localhost:3002"
echo "  UI:     http://localhost:5173"
echo "  Health: http://localhost:3002/api/health"
exec npm run dev
