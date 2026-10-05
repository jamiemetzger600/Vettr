#!/usr/bin/env bash
# Install / refresh Vettr LaunchAgents (login auto-start + hourly healthcheck).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/scripts/launchagents"
DEST="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/vettr"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

mkdir -p "$DEST" "$LOG_DIR" "${HOME}/.cloudflared"

AGENTS=(
  com.vettr.api
  com.vettr.web
  com.vettr.tunnel
  com.vettr.named-tunnel
  com.vettr.caffeinate
  com.vettr.healthcheck
)

echo "Installing Vettr LaunchAgents from $SRC → $DEST"

for label in "${AGENTS[@]}"; do
  src_plist="${SRC}/${label}.plist"
  dest_plist="${DEST}/${label}.plist"
  if [[ ! -f "$src_plist" ]]; then
    echo "ERROR: missing $src_plist" >&2
    exit 1
  fi

  cp "$src_plist" "$dest_plist"
  sed -i '' "s|__VETTR_ROOT__|${ROOT}|g" "$dest_plist"

  # Reload cleanly: bootout if loaded, then bootstrap
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

# Kick long-running services so they pick up any script changes
for label in com.vettr.api com.vettr.web com.vettr.tunnel com.vettr.named-tunnel; do
  launchctl kickstart -k "${DOMAIN}/${label}" 2>/dev/null || true
done

# Run one healthcheck now
bash "${ROOT}/scripts/vettr-healthcheck.sh" || true

echo ""
echo "Done. On every login these start automatically."
echo "Hourly healthcheck: com.vettr.healthcheck (StartInterval 3600)"
echo "Logs: $LOG_DIR"
echo "Manual check: bash ${ROOT}/scripts/vettr-healthcheck.sh"
