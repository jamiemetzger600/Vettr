#!/usr/bin/env bash
# Staging scrape-platform API (LaunchAgent entrypoint) → port 3013, dealcheck_staging.
# Uses /Users/jamie/Vettr-scrape only — never the production /Users/jamie/Vettr tree.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@15/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_ENV="${NODE_ENV:-development}"
export DOTENV_CONFIG_PATH=".env.staging"
export PORT="${PORT:-3013}"

ROOT="$(cd "$(dirname "$0")/../backend" && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env.staging" ]]; then
  echo "ERROR: missing $ROOT/.env.staging" >&2
  exit 1
fi

LSOF=/usr/sbin/lsof
if "$LSOF" -tiTCP:3013 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3013 already in use — monitoring existing scrape staging API"
  while "$LSOF" -tiTCP:3013 -sTCP:LISTEN >/dev/null 2>&1; do
    sleep 30
  done
  echo "Port 3013 freed; starting scrape staging API"
fi

exec /usr/local/bin/node --max-old-space-size=768 -r dotenv/config src/index.js
