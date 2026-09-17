#!/usr/bin/env bash
# Staging scrape worker (LaunchAgent entrypoint) — polls scrape_runs on dealcheck_staging.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@15/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_ENV="${NODE_ENV:-development}"
export DOTENV_CONFIG_PATH=".env.staging"

ROOT="$(cd "$(dirname "$0")/../backend" && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env.staging" ]]; then
  echo "ERROR: missing $ROOT/.env.staging" >&2
  exit 1
fi

exec /usr/local/bin/node -r dotenv/config src/worker.js
