#!/bin/bash
# ============================================================
# migrate_sqlite_to_postgres.sh — Safe Django SQLite -> PostgreSQL migration
# Run as app user after git pull.
#
# Usage:
#   bash deploy/migrate_sqlite_to_postgres.sh
#
# Notes:
# - Expects project at /var/www/satapp (override with APP_DIR env var).
# - Expects backend/.env to contain a PostgreSQL DATABASE_URL.
# - Creates backups under /var/www/satapp/backups.
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
BACKEND_DIR="$APP_DIR/backend"
BACKUPS_DIR="$APP_DIR/backups"
TS="$(date +%F_%H%M%S)"
PYTHON_BIN="${PYTHON_BIN:-$BACKEND_DIR/venv/bin/python}"
MANAGE_PY="$BACKEND_DIR/manage.py"
JSON_DUMP="$BACKUPS_DIR/data.sqlite.$TS.json"

echo "========================================="
echo " SQLite -> PostgreSQL migration starting"
echo " App dir: $APP_DIR"
echo "========================================="

if [[ ! -f "$MANAGE_PY" ]]; then
  echo "manage.py not found at $MANAGE_PY"
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python not found at $PYTHON_BIN"
  echo "Tip: run deploy/deploy.sh first to create venv."
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing $BACKEND_DIR/.env"
  exit 1
fi

if ! rg -q "^DATABASE_URL=postgres(ql)?://" "$BACKEND_DIR/.env"; then
  echo "DATABASE_URL is missing or not PostgreSQL in $BACKEND_DIR/.env"
  exit 1
fi

mkdir -p "$BACKUPS_DIR"

echo "==> Backing up SQLite file and .env..."
if [[ -f "$BACKEND_DIR/db.sqlite3" ]]; then
  cp "$BACKEND_DIR/db.sqlite3" "$BACKUPS_DIR/db.sqlite3.$TS.bak"
else
  echo "Warning: $BACKEND_DIR/db.sqlite3 not found (continuing)"
fi
cp "$BACKEND_DIR/.env" "$BACKUPS_DIR/backend.env.$TS.bak"

if [[ -d "$BACKEND_DIR/media" ]]; then
  echo "==> Backing up media..."
  tar -czf "$BACKUPS_DIR/media.$TS.tar.gz" -C "$BACKEND_DIR" media
fi

echo "==> Exporting data from SQLite using Django dumpdata..."
DEBUG=True DATABASE_URL= "$PYTHON_BIN" "$MANAGE_PY" dumpdata \
  --natural-foreign \
  --natural-primary \
  --exclude contenttypes \
  --exclude auth.permission \
  --indent 2 > "$JSON_DUMP"

python3 -m json.tool "$JSON_DUMP" > /dev/null
echo "Dump created: $JSON_DUMP"

echo "==> Creating row-count snapshot from SQLite..."
DEBUG=True DATABASE_URL= "$PYTHON_BIN" "$MANAGE_PY" shell -c "
from django.apps import apps
for m in apps.get_models():
    print(f'{m._meta.label}:{m.objects.count()}')
" > "$BACKUPS_DIR/counts.sqlite.$TS.txt"

echo "==> Running migrations on PostgreSQL..."
"$PYTHON_BIN" "$MANAGE_PY" check
"$PYTHON_BIN" "$MANAGE_PY" migrate --no-input

echo "==> Verifying PostgreSQL target app tables are empty before loaddata..."
POSTGRES_APP_ROWS="$("$PYTHON_BIN" "$MANAGE_PY" shell -c "
from django.apps import apps
total = 0
for m in apps.get_models():
    if m._meta.app_label in {'users', 'exams'}:
        total += m.objects.count()
print(total)
")"
if [[ "$POSTGRES_APP_ROWS" != "0" ]]; then
  echo "Abort: PostgreSQL already has ${POSTGRES_APP_ROWS} app rows (users/exams)."
  echo "This script only loads into a fresh PostgreSQL app dataset."
  exit 1
fi

echo "==> Loading SQLite dump into PostgreSQL..."
"$PYTHON_BIN" "$MANAGE_PY" loaddata "$JSON_DUMP"

echo "==> Collecting row-count snapshot from PostgreSQL..."
"$PYTHON_BIN" "$MANAGE_PY" shell -c "
from django.apps import apps
for m in apps.get_models():
    print(f'{m._meta.label}:{m.objects.count()}')
" > "$BACKUPS_DIR/counts.postgres.$TS.txt"

echo "==> Comparing row counts (differences may indicate issues)..."
diff -u "$BACKUPS_DIR/counts.sqlite.$TS.txt" "$BACKUPS_DIR/counts.postgres.$TS.txt" || true

echo "==> Post-migration smoke checks..."
"$PYTHON_BIN" "$MANAGE_PY" showmigrations | rg "\\[ \\]" && {
  echo "Warning: There are unapplied migrations."
} || true

echo ""
echo "========================================="
echo " Migration complete."
echo " Dump:            $JSON_DUMP"
echo " SQLite counts:   $BACKUPS_DIR/counts.sqlite.$TS.txt"
echo " PostgreSQL counts: $BACKUPS_DIR/counts.postgres.$TS.txt"
echo "========================================="
