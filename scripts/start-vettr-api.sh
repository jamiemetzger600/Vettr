#!/usr/bin/env bash
# Start Vettr backend against local Postgres (LaunchAgent entrypoint).
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@15/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_ENV="${NODE_ENV:-development}"
ROOT="$(cd "$(dirname "$0")/../backend" && pwd)"
cd "$ROOT"

# kickstart -k can leave an orphan node on :3001. The old "monitor existing"
# loop then never starts this tree, so new routes (Off Market) stay 404.
LSOF=/usr/sbin/lsof
PIDS="$("$LSOF" -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  echo "Port 3001 in use by leftover API ($PIDS) — stopping so this LaunchAgent can start current code"
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 1
  PIDS="$("$LSOF" -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "Port 3001 still held ($PIDS) — kill -9"
    # shellcheck disable=SC2086
    kill -9 $PIDS 2>/dev/null || true
    sleep 1
  fi
fi

exec /usr/local/bin/node --max-old-space-size=768 src/index.js
