#!/usr/bin/env bash
# ============================================================
# backup_postgres.sh — Logical PostgreSQL snapshot before deploy
# Run on the VPS as satapp BEFORE deploy/deploy.sh when using Postgres.
#
# Requires: DATABASE_URL in backend/.env, pg_dump in PATH,
# backend venv (for python-dotenv) at backend/venv.
#
# Usage:
#   bash deploy/backup_postgres.sh
#   APP_DIR=/var/www/satapp bash deploy/backup_postgres.sh
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
BACKEND_DIR="$APP_DIR/backend"
BACKUPS_DIR="$APP_DIR/backups"
VENV_PY="${VENV_PY:-$BACKEND_DIR/venv/bin/python}"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing $BACKEND_DIR/.env"
  exit 1
fi
if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing venv Python: $VENV_PY"
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found; install postgresql-client"
  exit 1
fi

mkdir -p "$BACKUPS_DIR"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUPS_DIR/pg_backup_${TS}.dump"

DBURL="$("$VENV_PY" -c "
from pathlib import Path
from dotenv import dotenv_values
vals = dotenv_values(Path('$BACKEND_DIR') / '.env')
u = vals.get('DATABASE_URL') or ''
print(u.strip() or '')
" 2>/dev/null || true)"

if [[ -z "$DBURL" ]]; then
  echo "DATABASE_URL not set or empty in .env — skip backup or fix config."
  exit 1
fi

pg_dump "$DBURL" --no-owner --no-acl -Fc -f "$OUT"
echo "OK: wrote $OUT"
ls -la "$OUT"
