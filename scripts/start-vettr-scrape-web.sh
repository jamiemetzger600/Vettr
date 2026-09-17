#!/usr/bin/env bash
# Staging scrape-platform web (LaunchAgent entrypoint) → port 5175 → API :3013.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export VITE_API_PROXY="${VITE_API_PROXY:-http://localhost:3013}"

ROOT="$(cd "$(dirname "$0")/../web" && pwd)"
cd "$ROOT"

LSOF=/usr/sbin/lsof
if "$LSOF" -tiTCP:5175 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 5175 already in use — monitoring existing scrape staging web"
  while "$LSOF" -tiTCP:5175 -sTCP:LISTEN >/dev/null 2>&1; do
    sleep 30
  done
  echo "Port 5175 freed; starting scrape staging web"
fi

if [[ -x "$ROOT/node_modules/.bin/vite" ]]; then
  exec "$ROOT/node_modules/.bin/vite" --host 0.0.0.0 --port 5175 --strictPort
fi

exec /usr/local/bin/npm run dev:staging
