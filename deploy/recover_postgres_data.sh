#!/bin/bash
# ============================================================
# recover_postgres_data.sh — Recover PostgreSQL data from latest dump
#
# Usage:
#   bash deploy/recover_postgres_data.sh
#   bash deploy/recover_postgres_data.sh --dump /var/www/satapp/backups/data.sqlite.2026-03-24_120000.json
#   bash deploy/recover_postgres_data.sh --force
#
# Notes:
# - Expects backend/.env with PostgreSQL DATABASE_URL.
# - Loads latest data.sqlite.*.json backup by default.
# - Refuses to load if app tables already contain rows, unless --force.
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
BACKEND_DIR="$APP_DIR/backend"
BACKUPS_DIR="$APP_DIR/backups"
PYTHON_BIN="${PYTHON_BIN:-$BACKEND_DIR/venv/bin/python}"
MANAGE_PY="$BACKEND_DIR/manage.py"
DUMP_FILE=""
FORCE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump)
      DUMP_FILE="$2"; shift 2 ;;
    --force)
      FORCE="true"; shift ;;
    *)
      echo "Unknown argument: $1"
      exit 1 ;;
  esac
done

if [[ ! -f "$MANAGE_PY" ]]; then
  echo "Missing $MANAGE_PY"
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing Python executable: $PYTHON_BIN"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing $BACKEND_DIR/.env"
  exit 1
fi

if ! grep -Eq "^DATABASE_URL=postgres(ql)?://" "$BACKEND_DIR/.env"; then
  echo "DATABASE_URL in $BACKEND_DIR/.env is missing or not PostgreSQL"
  exit 1
fi

if [[ -z "$DUMP_FILE" ]]; then
  DUMP_FILE="$(ls -1t "$BACKUPS_DIR"/data.sqlite.*.json 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "No dump file found. Expected something like:"
  echo "  $BACKUPS_DIR/data.sqlite.YYYY-MM-DD_HHMMSS.json"
  exit 1
fi

echo "Using dump file: $DUMP_FILE"
python3 -m json.tool "$DUMP_FILE" > /dev/null

APP_ROW_COUNT_RAW="$("$PYTHON_BIN" "$MANAGE_PY" shell -c "
from django.apps import apps
total = 0
for m in apps.get_models():
    if m._meta.app_label in {'users', 'exams'}:
        total += m.objects.count()
print(total)
")"
APP_ROW_COUNT="$(printf '%s\n' "$APP_ROW_COUNT_RAW" | grep -E '^[0-9]+$' | tail -n 1)"
if [[ -z "$APP_ROW_COUNT" ]]; then
  echo "Could not parse app row count. Raw output:"
  printf '%s\n' "$APP_ROW_COUNT_RAW"
  exit 1
fi

echo "Current PostgreSQL app row count (users+exams): $APP_ROW_COUNT"

if [[ "$APP_ROW_COUNT" != "0" && "$FORCE" != "true" ]]; then
  echo "Abort: database is not empty."
  echo "If you really want to load anyway, run with --force."
  exit 1
fi

echo "Applying migrations..."
"$PYTHON_BIN" "$MANAGE_PY" migrate --no-input

echo "Loading dump into PostgreSQL..."
"$PYTHON_BIN" "$MANAGE_PY" loaddata "$DUMP_FILE"

echo "Post-load row counts:"
"$PYTHON_BIN" "$MANAGE_PY" shell -c "
from django.apps import apps
for m in apps.get_models():
    if m._meta.app_label in {'users', 'exams'}:
        print(f'{m._meta.label}: {m.objects.count()}')
"

echo "Done."
