#!/usr/bin/env bash
# Per-boot startup for Vettr Cloud Agent environment.
# Brings up the PostgreSQL cluster the backend depends on. Idempotent:
# it tolerates an already-running cluster and returns once the DB is ready.
set -euo pipefail

PG_VER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
if [ -z "${PG_VER}" ]; then
  echo "ERROR: PostgreSQL is not installed in this image." >&2
  exit 1
fi

if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  echo "==> Starting PostgreSQL cluster ${PG_VER}/main"
  sudo pg_ctlcluster "${PG_VER}" main start || true
else
  echo "==> PostgreSQL cluster already online"
fi

for i in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "==> PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "ERROR: PostgreSQL did not become ready in time." >&2
exit 1
