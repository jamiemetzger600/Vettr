#!/usr/bin/env bash
# Named Cloudflare tunnel "vettr-api" (stable). The vettr-api Worker reaches
# 127.0.0.1:3001 through it via its Workers VPC binding — no rotating URL.
# Quick tunnel (start-vettr-tunnel.sh) stays running as the Worker's fallback.
set -euo pipefail

CF_DIR="${HOME}/.cloudflared"
TOKEN_FILE="${CF_DIR}/vettr-api.token"
CONFIG="${CF_DIR}/vettr-vpc.yml"

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "ERROR: missing tunnel token $TOKEN_FILE" >&2
  sleep 60
  exit 1
fi

# Workers VPC needs private-network (warp) routing enabled on the connector.
if [[ ! -f "$CONFIG" ]]; then
  printf 'warp-routing:\n  enabled: true\ningress:\n  - service: http_status:404\n' > "$CONFIG"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting named tunnel vettr-api"
exec /opt/homebrew/bin/cloudflared tunnel --no-autoupdate --config "$CONFIG" run --token "$(cat "$TOKEN_FILE")"
