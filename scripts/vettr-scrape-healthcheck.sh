#!/usr/bin/env bash
# Health check for scrape-platform staging stack (Vettr-scrape worktree).
# Restarts LaunchAgents when sidecar / API / web / worker are down.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/vettr"
mkdir -p "$LOG_DIR"
LOG="${LOG_DIR}/scrape-healthcheck.log"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() {
  echo "[$TS] $*" | tee -a "$LOG"
}

kick() {
  local label="$1"
  log "RESTART $label"
  launchctl kickstart -k "${DOMAIN}/${label}" 2>>"$LOG" || \
    launchctl bootstrap "$DOMAIN" "${HOME}/Library/LaunchAgents/${label}.plist" 2>>"$LOG" || true
}

ensure_loaded() {
  local label="$1"
  if ! launchctl print "${DOMAIN}/${label}" >/dev/null 2>&1; then
    local plist="${HOME}/Library/LaunchAgents/${label}.plist"
    if [[ -f "$plist" ]]; then
      log "LOAD missing agent $label"
      launchctl bootstrap "$DOMAIN" "$plist" 2>>"$LOG" || \
        launchctl load -w "$plist" 2>>"$LOG" || true
    else
      log "WARN missing plist for $label ($plist)"
    fi
  fi
}

sidecar_ok() {
  curl -sf --max-time 8 "http://127.0.0.1:3012/health" >/dev/null 2>&1
}

api_ok() {
  curl -sf --max-time 8 "http://127.0.0.1:3013/health" >/dev/null 2>&1
}

web_ok() {
  curl -sf --max-time 8 "http://127.0.0.1:5175/" >/dev/null 2>&1
}

worker_loaded() {
  launchctl print "${DOMAIN}/com.vettr.scrape-worker" >/dev/null 2>&1
}

log "scrape healthcheck start"

for label in com.vettr.scrape-sidecar com.vettr.scrape-api com.vettr.scrape-worker com.vettr.scrape-web; do
  ensure_loaded "$label"
done

if sidecar_ok; then
  log "OK sidecar :3012"
else
  log "DOWN sidecar :3012"
  kick com.vettr.scrape-sidecar
  sleep 8
  if sidecar_ok; then log "OK sidecar after restart"; else log "FAIL sidecar still down"; fi
fi

if api_ok; then
  log "OK scrape-api :3013"
else
  log "DOWN scrape-api :3013"
  kick com.vettr.scrape-api
  sleep 8
  if api_ok; then log "OK scrape-api after restart"; else log "FAIL scrape-api still down"; fi
fi

if worker_loaded; then
  log "OK scrape-worker loaded"
else
  log "DOWN scrape-worker"
  kick com.vettr.scrape-worker
fi

if web_ok; then
  log "OK scrape-web :5175"
else
  log "DOWN scrape-web :5175"
  kick com.vettr.scrape-web
  sleep 8
  if web_ok; then log "OK scrape-web after restart"; else log "FAIL scrape-web still down"; fi
fi

log "scrape healthcheck done"
exit 0
