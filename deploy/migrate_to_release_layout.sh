#!/usr/bin/env bash
# ============================================================
# migrate_to_release_layout.sh — One-time VPS migration to
# releases/current/shared layout (see deploy/RELEASE_LAYOUT.md).
#
# Run as satapp on the server. Idempotent: safe to re-run when
# shared/ already exists.
#
# Usage:
#   bash /var/www/satapp/deploy/migrate_to_release_layout.sh
#   APP_DIR=/var/www/satapp bash deploy/migrate_to_release_layout.sh
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
SHARED="$APP_DIR/shared"
LEGACY_BACKEND="$APP_DIR/backend"
LEGACY_FRONTEND="$APP_DIR/frontend"
LEGACY_BACKUPS="$APP_DIR/backups"

echo "========================================="
echo " Migrate to release layout"
echo " APP_DIR=$APP_DIR"
echo "========================================="

mkdir -p "$SHARED/backups" "$SHARED/media" "$APP_DIR/releases"

# Backend env
if [[ -f "$SHARED/backend.env" ]]; then
  echo "-> shared/backend.env already exists; skip move."
elif [[ -f "$LEGACY_BACKEND/.env" ]] && [[ ! -L "$LEGACY_BACKEND/.env" ]]; then
  echo "-> Moving backend/.env -> shared/backend.env"
  mv "$LEGACY_BACKEND/.env" "$SHARED/backend.env"
  chmod 600 "$SHARED/backend.env" || true
elif [[ -f "$LEGACY_BACKEND/.env" ]]; then
  echo "-> backend/.env is a symlink; copy target to shared/backend.env if missing"
  if [[ ! -f "$SHARED/backend.env" ]]; then
    cp -aL "$LEGACY_BACKEND/.env" "$SHARED/backend.env"
    chmod 600 "$SHARED/backend.env" || true
  fi
else
  echo "WARN: No backend/.env at $LEGACY_BACKEND/.env — create $SHARED/backend.env before release deploy."
fi

# Frontend env
if [[ -f "$SHARED/frontend.env.production" ]]; then
  echo "-> shared/frontend.env.production already exists; skip move."
elif [[ -f "$LEGACY_FRONTEND/.env.production" ]] && [[ ! -L "$LEGACY_FRONTEND/.env.production" ]]; then
  echo "-> Moving frontend/.env.production -> shared/frontend.env.production"
  mv "$LEGACY_FRONTEND/.env.production" "$SHARED/frontend.env.production"
  chmod 600 "$SHARED/frontend.env.production" || true
elif [[ -f "$LEGACY_FRONTEND/.env.production" ]]; then
  if [[ ! -f "$SHARED/frontend.env.production" ]]; then
    cp -aL "$LEGACY_FRONTEND/.env.production" "$SHARED/frontend.env.production"
    chmod 600 "$SHARED/frontend.env.production" || true
  fi
else
  echo "WARN: No frontend/.env.production — create $SHARED/frontend.env.production before release deploy."
fi

# Media: copy legacy files into shared (do not delete legacy until you cut over)
if [[ -d "$LEGACY_BACKEND/media" ]] && [[ ! -L "$LEGACY_BACKEND/media" ]]; then
  if [[ -n "$(find "$LEGACY_BACKEND/media" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
    echo "-> Rsync legacy backend/media -> shared/media"
    mkdir -p "$SHARED/media"
    rsync -a "$LEGACY_BACKEND/media/" "$SHARED/media/" || true
  fi
fi

mkdir -p "$SHARED/media/profiles"

# Legacy backups directory at repo root
if [[ -d "$LEGACY_BACKUPS" ]] && [[ "$(find "$LEGACY_BACKUPS" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "-> Moving existing $LEGACY_BACKUPS -> shared/backups"
  rsync -a "$LEGACY_BACKUPS/" "$SHARED/backups/" || true
  rm -rf "$LEGACY_BACKUPS" 2>/dev/null || true
fi

echo ""
echo "========================================="
echo " Migration steps finished."
echo " Next:"
echo "  1. sudo cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/satapp && sudo nginx -t && sudo systemctl reload nginx"
echo "  2. bash $APP_DIR/deploy/release_deploy.sh origin/main   # or a SHA"
echo " See deploy/RELEASE_LAYOUT.md"
echo "========================================="
