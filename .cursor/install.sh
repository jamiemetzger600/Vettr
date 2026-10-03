#!/usr/bin/env bash
# Idempotent Cloud Agent install for Vettr.
# Prepares local Postgres, installs backend/web npm deps, writes a dev .env,
# and runs database migrations. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_NAME="vettr"
DB_USER="vettr"
DB_PASS="vettr"

echo "==> Ensuring PostgreSQL cluster is running"
PG_VER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
if [ -z "${PG_VER}" ]; then
  echo "ERROR: PostgreSQL is not installed in this image." >&2
  exit 1
fi
# Start the default cluster if it is not already online (idempotent).
if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "${PG_VER}" main start || true
fi
# Wait for the socket to accept connections.
for i in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring database role and database exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}'; END IF; END \$\$;"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "==> Writing backend/.env (dev defaults) if missing"
if [ ! -f backend/.env ]; then
  JWT_SECRET="$(openssl rand -base64 32)"
  cat > backend/.env <<EOF
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=30d
WEB_APP_URL=http://localhost:5173
EOF
  echo "    created backend/.env"
else
  echo "    backend/.env already present, leaving as-is"
fi

echo "==> Installing backend dependencies"
( cd backend && npm ci )

echo "==> Installing web dependencies"
( cd web && npm ci )

echo "==> Running database migrations"
( cd backend && npm run migrate )

echo "==> Install complete"
