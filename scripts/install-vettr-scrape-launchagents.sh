#!/usr/bin/env bash
# Install / refresh scrape-platform LaunchAgents (staging stack on Vettr-scrape).
# Separate from production com.vettr.api / com.vettr.web (those stay on /Users/jamie/Vettr).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/scripts/launchagents"
DEST="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/vettr"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

mkdir -p "$DEST" "$LOG_DIR"

AGENTS=(
  com.vettr.scrape-sidecar
  com.vettr.scrape-api
  com.vettr.scrape-worker
  com.vettr.scrape-web
  com.vettr.scrape-healthcheck
)

echo "Installing scrape LaunchAgents from $SRC → $DEST"
echo "Root: $ROOT"

for label in "${AGENTS[@]}"; do
  src_plist="${SRC}/${label}.plist"
  dest_plist="${DEST}/${label}.plist"
  if [[ ! -f "$src_plist" ]]; then
    echo "ERROR: missing $src_plist" >&2
    exit 1
  fi

  cp "$src_plist" "$dest_plist"
  # Use | as sed delimiter so paths with / are safe
  sed -i '' "s|__VETTR_SCRAPE_ROOT__|${ROOT}|g" "$dest_plist"

  if launchctl print "${DOMAIN}/${label}" >/dev/null 2>&1; then
    launchctl bootout "${DOMAIN}/${label}" 2>/dev/null || true
    sleep 1
  fi
  if launchctl bootstrap "$DOMAIN" "$dest_plist" 2>/dev/null; then
    echo "  loaded $label"
  elif launchctl load -w "$dest_plist" 2>/dev/null; then
    echo "  loaded $label (legacy load)"
  else
    echo "  WARN could not load $label — check: launchctl print ${DOMAIN}/${label}" >&2
  fi
done

# Kick long-running services (skip interval-only healthcheck)
for label in com.vettr.scrape-sidecar com.vettr.scrape-api com.vettr.scrape-worker com.vettr.scrape-web; do
  launchctl kickstart -k "${DOMAIN}/${label}" 2>/dev/null || true
  sleep 1
done

bash "${ROOT}/scripts/vettr-scrape-healthcheck.sh" || true

echo ""
echo "Done. Scrape staging starts on every login (KeepAlive)."
echo "  web:     http://localhost:5175/admin/sources"
echo "  API:     http://localhost:3013/health"
echo "  sidecar: http://127.0.0.1:3012/health"
echo "Logs: $LOG_DIR/scrape-*.log"
echo "Manual check: bash ${ROOT}/scripts/vettr-scrape-healthcheck.sh"
echo "Restart one: launchctl kickstart -k ${DOMAIN}/com.vettr.scrape-api"
