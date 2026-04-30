#!/usr/bin/env bash
# Future Horizons ASPT — stop the local dev stack on Linux/macOS.
set -euo pipefail
cd "$(dirname "$0")"

if command -v docker compose >/dev/null 2>&1; then
  docker compose down
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose down
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is on PATH." >&2
  exit 1
fi
echo "Stopped."
