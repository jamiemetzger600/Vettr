#!/usr/bin/env bash
# Start Vettr Vite web app (LaunchAgent entrypoint).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/../web" && pwd)"
cd "$ROOT"

# Same leftover-listener trap as the API LaunchAgent: do not sit in a monitor
# loop on an old Vite, or this checkout (Off Market tab) never loads.
LSOF=/usr/sbin/lsof
PIDS="$("$LSOF" -tiTCP:5173 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  echo "Port 5173 in use by leftover web ($PIDS) — stopping so this LaunchAgent can start current code"
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 1
  PIDS="$("$LSOF" -tiTCP:5173 -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "Port 5173 still held ($PIDS) — kill -9"
    # shellcheck disable=SC2086
    kill -9 $PIDS 2>/dev/null || true
    sleep 1
  fi
fi

# Bind to 0.0.0.0 so phones/tablets on the same Wi-Fi can reach the dev server
# (was 127.0.0.1, which is loopback-only and unreachable from other devices).
# Prefer local vite binary; fall back to npm run dev
if [[ -x "$ROOT/node_modules/.bin/vite" ]]; then
  exec "$ROOT/node_modules/.bin/vite" --host 0.0.0.0 --port 5173 --strictPort
fi

exec /usr/local/bin/npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
