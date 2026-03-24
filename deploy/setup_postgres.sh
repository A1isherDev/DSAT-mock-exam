#!/bin/bash
# ============================================================
# setup_postgres.sh — Install and secure PostgreSQL on Hetzner
# Usage:
#   sudo bash deploy/setup_postgres.sh \
#     --db-name lms_mastersat_db \
#     --db-user lms_mastersat_user \
#     --db-password 'strong-password' \
#     --allow-ip YOUR_LOCAL_PUBLIC_IP
# ============================================================

set -euo pipefail

DB_NAME=""
DB_USER=""
DB_PASSWORD=""
ALLOW_IP=""
DB_PORT="5432"
LISTEN_ADDRESSES="*"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-name)
      DB_NAME="$2"; shift 2 ;;
    --db-user)
      DB_USER="$2"; shift 2 ;;
    --db-password)
      DB_PASSWORD="$2"; shift 2 ;;
    --allow-ip)
      ALLOW_IP="$2"; shift 2 ;;
    --db-port)
      DB_PORT="$2"; shift 2 ;;
    --listen-addresses)
      LISTEN_ADDRESSES="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1"
      exit 1 ;;
  esac
done

if [[ -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" || -z "$ALLOW_IP" ]]; then
  echo "Missing required args."
  echo "Example:"
  echo "  sudo bash deploy/setup_postgres.sh --db-name lms_mastersat_db --db-user lms_mastersat_user --db-password 'strong-password' --allow-ip 1.2.3.4"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

echo "==> Installing PostgreSQL..."
apt-get update
apt-get install -y postgresql postgresql-contrib ufw
systemctl enable postgresql
systemctl start postgresql

PG_VERSION="$(sudo -u postgres psql -tAc "SHOW server_version_num" | cut -c1-2)"
PG_ETC_DIR="/etc/postgresql/$PG_VERSION/main"
POSTGRESQL_CONF="$PG_ETC_DIR/postgresql.conf"
PG_HBA_CONF="$PG_ETC_DIR/pg_hba.conf"

if [[ ! -f "$POSTGRESQL_CONF" || ! -f "$PG_HBA_CONF" ]]; then
  echo "Could not locate PostgreSQL config files under $PG_ETC_DIR"
  exit 1
fi

echo "==> Creating database and user..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | rg -q "1"; then
  sudo -u postgres createdb "$DB_NAME" -O "$DB_USER"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE ${DB_USER} SET client_encoding TO 'UTF8';
ALTER ROLE ${DB_USER} SET default_transaction_isolation TO 'read committed';
ALTER ROLE ${DB_USER} SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

echo "==> Configuring postgresql.conf listen_addresses..."
if rg -q "^[# ]*listen_addresses\\s*=" "$POSTGRESQL_CONF"; then
  sed -i "s|^[# ]*listen_addresses\\s*=.*|listen_addresses = '${LISTEN_ADDRESSES}'|" "$POSTGRESQL_CONF"
else
  echo "listen_addresses = '${LISTEN_ADDRESSES}'" >> "$POSTGRESQL_CONF"
fi

echo "==> Configuring pg_hba.conf rules..."
APP_LOCAL_RULE="host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256"
REMOTE_RULE="host    ${DB_NAME}    ${DB_USER}    ${ALLOW_IP}/32    scram-sha-256"

if ! rg -q "^${APP_LOCAL_RULE// /\\s+}$" "$PG_HBA_CONF"; then
  echo "$APP_LOCAL_RULE" >> "$PG_HBA_CONF"
fi
if ! rg -q "^${REMOTE_RULE// /\\s+}$" "$PG_HBA_CONF"; then
  echo "$REMOTE_RULE" >> "$PG_HBA_CONF"
fi

echo "==> Restarting PostgreSQL..."
systemctl restart postgresql
systemctl --no-pager status postgresql | rg "Active:|loaded"

echo "==> Opening firewall only for ${ALLOW_IP} on ${DB_PORT}..."
ufw allow from "${ALLOW_IP}" to any port "${DB_PORT}" proto tcp
ufw status | rg "Status:|5432|22|80|443"

echo ""
echo "PostgreSQL setup complete."
echo "DB: ${DB_NAME}"
echo "User: ${DB_USER}"
echo "Allowed remote IP: ${ALLOW_IP}/32"
