#!/usr/bin/env bash
# ============================================================
# backup_postgres.sh — Logical PostgreSQL snapshot before deploy
# Run on the VPS as satapp BEFORE deploy when using Postgres.
#
# Requires: DATABASE_URL in env file, pg_dump in PATH,
# Python venv with python-dotenv (prefers current release venv).
#
# Usage:
#   bash deploy/backup_postgres.sh
#   APP_DIR=/var/www/satapp bash deploy/backup_postgres.sh
#
# Env file resolution (first match):
#   $APP_DIR/shared/backend.env
#   $APP_DIR/current/backend/.env (symlink target)
#   $APP_DIR/backend/.env
#
# Backups directory: $APP_DIR/shared/backups if present, else $APP_DIR/backups
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"

BACKEND_ENV=""
if [[ -f "$APP_DIR/shared/backend.env" ]]; then
  BACKEND_ENV="$APP_DIR/shared/backend.env"
elif [[ -f "$APP_DIR/current/backend/.env" ]]; then
  BACKEND_ENV="$(readlink -f "$APP_DIR/current/backend/.env" 2>/dev/null || echo "$APP_DIR/current/backend/.env")"
elif [[ -f "$APP_DIR/backend/.env" ]]; then
  BACKEND_ENV="$APP_DIR/backend/.env"
fi

if [[ -z "$BACKEND_ENV" ]] || [[ ! -f "$BACKEND_ENV" ]]; then
  echo "No backend env file found (shared/backend.env, current/backend/.env, or backend/.env)."
  exit 1
fi

VENV_PY="${VENV_PY:-}"
if [[ -z "$VENV_PY" ]]; then
  if [[ -x "$APP_DIR/current/backend/venv/bin/python" ]]; then
    VENV_PY="$APP_DIR/current/backend/venv/bin/python"
  elif [[ -x "$APP_DIR/backend/venv/bin/python" ]]; then
    VENV_PY="$APP_DIR/backend/venv/bin/python"
  fi
fi
if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing venv Python (expected current/backend/venv or backend/venv). Set VENV_PY=..."
  exit 1
fi

BACKUPS_DIR="$APP_DIR/backups"
if [[ -d "$APP_DIR/shared/backups" ]]; then
  BACKUPS_DIR="$APP_DIR/shared/backups"
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found; install postgresql-client"
  exit 1
fi

mkdir -p "$BACKUPS_DIR"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUPS_DIR/pg_backup_${TS}.dump"

DBURL="$(ENV_FILE="$BACKEND_ENV" "$VENV_PY" -c "
from pathlib import Path
import os
from dotenv import dotenv_values
vals = dotenv_values(Path(os.environ['ENV_FILE']))
u = vals.get('DATABASE_URL') or ''
print(u.strip() or '')
" 2>/dev/null || true)"

if [[ -z "$DBURL" ]]; then
  echo "DATABASE_URL not set or empty in env — skip backup or fix config."
  exit 1
fi

pg_dump "$DBURL" --no-owner --no-acl -Fc -f "$OUT"
echo "OK: wrote $OUT"
ls -la "$OUT"
