#!/bin/bash
# ============================================================
# deploy.sh — Production deployment script
# Run on VPS as app user.
#
# Usage:
#   bash deploy/deploy.sh
#   bash deploy/deploy.sh --skip-pull
#   bash deploy/deploy.sh --with-sqlite-migration
# ============================================================

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
ECOSYSTEM_FILE="$APP_DIR/deploy/ecosystem.config.js"
MIGRATION_SCRIPT="$APP_DIR/deploy/migrate_sqlite_to_postgres.sh"

SKIP_PULL="false"
WITH_SQLITE_MIGRATION="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)
      SKIP_PULL="true"; shift ;;
    --with-sqlite-migration)
      WITH_SQLITE_MIGRATION="true"; shift ;;
    *)
      echo "Unknown argument: $1"
      exit 1 ;;
  esac
done

on_error() {
  local exit_code=$?
  echo ""
  echo "Deployment failed (exit code: $exit_code)."
  echo "Check logs: pm2 logs"
  exit "$exit_code"
}
trap on_error ERR

echo "========================================="
echo " MasterSAT — Deploying Application"
echo " App dir: $APP_DIR"
echo "========================================="

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Git repository not found at $APP_DIR"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/manage.py" ]]; then
  echo "Missing $BACKEND_DIR/manage.py"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing $BACKEND_DIR/.env"
  exit 1
fi

if [[ ! -f "$ECOSYSTEM_FILE" ]]; then
  echo "Missing PM2 ecosystem file: $ECOSYSTEM_FILE"
  exit 1
fi

if [[ "$SKIP_PULL" == "false" ]]; then
  echo "-> Pulling latest code..."
  git -C "$APP_DIR" pull --ff-only origin main
else
  echo "-> Skipping git pull (--skip-pull)"
fi

echo "-> Preparing Python virtual environment..."
if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

echo "-> Installing backend dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

if [[ "$WITH_SQLITE_MIGRATION" == "true" ]]; then
  echo "-> Running one-time SQLite -> PostgreSQL migration..."
  if [[ ! -x "$MIGRATION_SCRIPT" ]]; then
    chmod +x "$MIGRATION_SCRIPT"
  fi
  bash "$MIGRATION_SCRIPT"
fi

echo "-> Running Django checks..."
"$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" check

echo "-> Applying database migrations..."
"$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" migrate --no-input

echo "-> Ensuring media directories (profile uploads, etc.)..."
mkdir -p "$BACKEND_DIR/media/profiles"

echo "-> Collecting static files..."
"$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" collectstatic --no-input

echo "-> Installing frontend dependencies..."
npm ci --prefix "$FRONTEND_DIR"

echo "-> Building frontend..."
npm run build --prefix "$FRONTEND_DIR"

echo "-> Restarting PM2 services..."
pm2 reload "$ECOSYSTEM_FILE" --update-env || pm2 start "$ECOSYSTEM_FILE"
pm2 save

echo ""
echo "========================================="
echo " Deployment complete."
echo " Check status: pm2 status"
echo " Check logs:   pm2 logs"
echo "========================================="
