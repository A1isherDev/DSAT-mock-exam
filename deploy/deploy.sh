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
# In-place layout uses legacy PM2 paths (not /current). Release deploys use ecosystem.config.js.
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-$APP_DIR/deploy/ecosystem.legacy.config.js}"
MIGRATION_SCRIPT="$APP_DIR/deploy/migrate_sqlite_to_postgres.sh"
NGINX_SITE_FILE_SRC="$APP_DIR/deploy/nginx.conf"
NGINX_SITE_FILE_DST="${NGINX_SITE_FILE_DST:-/etc/nginx/sites-available/satapp}"
NGINX_ENABLE_LINK_DST="${NGINX_ENABLE_LINK_DST:-/etc/nginx/sites-enabled/satapp}"

SKIP_PULL="false"
WITH_SQLITE_MIGRATION="false"
WITH_NGINX="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)
      SKIP_PULL="true"; shift ;;
    --with-sqlite-migration)
      WITH_SQLITE_MIGRATION="true"; shift ;;
    --with-nginx)
      WITH_NGINX="true"; shift ;;
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
  # An old untracked deploy/package-lock.json on the server blocks checkout when the same path
  # exists in git; remove only if still untracked (safe for normal deploys).
  if [[ -f "$APP_DIR/deploy/package-lock.json" ]]; then
    if git -C "$APP_DIR" status --porcelain deploy/package-lock.json 2>/dev/null | grep -q '^??'; then
      echo "   Removing untracked deploy/package-lock.json so git pull can merge."
      rm -f "$APP_DIR/deploy/package-lock.json"
    fi
  fi
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

if [[ "$WITH_NGINX" == "true" ]]; then
  echo "-> Installing Nginx site config..."
  if [[ ! -f "$NGINX_SITE_FILE_SRC" ]]; then
    echo "Missing nginx config template: $NGINX_SITE_FILE_SRC"
    exit 1
  fi
  if command -v sudo >/dev/null 2>&1; then
    # Don't clobber Certbot-managed site configs unless explicitly forced.
    if sudo test -f "$NGINX_SITE_FILE_DST" && sudo rg -n --fixed-strings "managed by Certbot" "$NGINX_SITE_FILE_DST" >/dev/null 2>&1; then
      if [[ "${FORCE_NGINX_OVERWRITE:-}" == "true" ]]; then
        echo "   ! Existing Nginx site contains Certbot markers; FORCE_NGINX_OVERWRITE=true so overwriting."
        sudo cp "$NGINX_SITE_FILE_SRC" "$NGINX_SITE_FILE_DST"
      else
        echo "   ! Existing Nginx site contains Certbot markers; skipping overwrite."
        echo "     Set FORCE_NGINX_OVERWRITE=true to override, then re-run certbot if needed."
      fi
    else
      sudo cp "$NGINX_SITE_FILE_SRC" "$NGINX_SITE_FILE_DST"
    fi
    if [[ ! -L "$NGINX_ENABLE_LINK_DST" ]]; then
      sudo ln -s "$NGINX_SITE_FILE_DST" "$NGINX_ENABLE_LINK_DST" || true
    fi
    sudo nginx -t
    sudo systemctl reload nginx
  else
    echo "sudo is not available; copy nginx.conf manually to $NGINX_SITE_FILE_DST"
  fi
fi

echo ""
echo "========================================="
echo " Deployment complete."
echo " Check status: pm2 status"
echo " Check logs:   pm2 logs"
echo "========================================="
