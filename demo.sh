#!/usr/bin/env bash
# HERM Platform — one-shot demo bootstrap for Linux/macOS.
# Mirrors demo.bat. For day-two start/stop use start.sh / stop.sh.
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================"
echo " HERM Platform -- One-Shot Demo Bootstrap"
echo "============================================"
echo " Runs install + Prisma sync + seed + dev servers in one go."
echo "============================================"

echo "[1/6] Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "  ERROR: Node.js not on PATH (need Node 20+)." >&2; exit 1; }
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    echo "  ERROR: docker is installed but neither 'docker compose' nor 'docker-compose' works." >&2
    exit 1
  fi
else
  echo "  ERROR: Docker not on PATH." >&2
  exit 1
fi
echo "  Node and Docker present (compose: $DC)."

echo "[2/6] Ensuring .env exists..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  .env created from .env.example"
else
  echo "  .env already present (not overwritten)"
fi

echo "[3/6] Starting Docker services (PostgreSQL + Redis)..."
$DC up -d

echo "[4/6] Waiting for PostgreSQL to be ready..."
RETRIES=0
until $DC exec -T postgres pg_isready -U herm -d herm_platform >/dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge 30 ]; then
    echo "  PostgreSQL did not become ready within 30s. Inspect '$DC logs postgres'." >&2
    exit 1
  fi
  sleep 1
done
echo "  PostgreSQL is ready."

echo "[5/6] Bootstrapping the workspace (install + generate + db push + seed)..."
npm run demo:bootstrap

cat <<'EOF'

============================================
 Demo ready. Credentials are surfaced on the
 Login page and documented in DEMO.md.
   URL:   http://localhost:5173
   Email: demo@demo-university.ac.uk
   Pass:  demo12345
 Validate from a second terminal with:
   npm run demo:validate
============================================

EOF

echo "[6/6] Starting development servers (Ctrl+C to stop)..."
exec npm run dev
