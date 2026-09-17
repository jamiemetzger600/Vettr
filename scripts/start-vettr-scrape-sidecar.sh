#!/usr/bin/env bash
# Scrapling sidecar (LaunchAgent entrypoint) → 127.0.0.1:3012.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../scraper-py" && pwd)"
cd "$ROOT"

UVICORN="$ROOT/.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  echo "ERROR: missing $UVICORN — run: cd scraper-py && uv sync && scrapling install" >&2
  exit 1
fi

LSOF=/usr/sbin/lsof
if "$LSOF" -tiTCP:3012 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3012 already in use — monitoring existing scrape sidecar"
  while "$LSOF" -tiTCP:3012 -sTCP:LISTEN >/dev/null 2>&1; do
    sleep 30
  done
  echo "Port 3012 freed; starting scrape sidecar"
fi

mkdir -p "${HOME}/Library/Application Support/vettr"
export SCRAPLING_ADAPTIVE_DB="${SCRAPLING_ADAPTIVE_DB:-${HOME}/Library/Application Support/vettr/scrapling.db}"

exec "$UVICORN" app:app --host 127.0.0.1 --port 3012
