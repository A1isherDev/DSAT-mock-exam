#!/bin/bash
# ============================================================
# deploy.sh — Application Deployment Script
# Run from /var/www/satapp on the VPS as satapp user
# Usage: bash deploy/deploy.sh
# ============================================================

set -e

APP_DIR="/var/www/satapp"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

echo "========================================="
echo " SAT Fergana — Deploying Application"
echo "========================================="

# ── Pull latest code ──────────────────────────────────────────
echo "→ Pulling latest code..."
git -C $APP_DIR pull origin main

# ── Backend ───────────────────────────────────────────────────
echo "→ Setting up Python virtual environment..."
python3 -m venv $VENV_DIR

echo "→ Installing backend dependencies..."
$VENV_DIR/bin/pip install --upgrade pip
$VENV_DIR/bin/pip install -r $BACKEND_DIR/requirements.txt

echo "→ Running database migrations..."
$VENV_DIR/bin/python $BACKEND_DIR/manage.py migrate --no-input

echo "→ Collecting static files..."
$VENV_DIR/bin/python $BACKEND_DIR/manage.py collectstatic --no-input

# ── Frontend ──────────────────────────────────────────────────
echo "→ Installing frontend dependencies..."
npm install --prefix $FRONTEND_DIR --production=false

echo "→ Building frontend..."
npm run build --prefix $FRONTEND_DIR

# ── Restart Services ──────────────────────────────────────────
echo "→ Restarting services with PM2..."
pm2 reload $APP_DIR/deploy/ecosystem.config.js --update-env || \
  pm2 start $APP_DIR/deploy/ecosystem.config.js

pm2 save

echo ""
echo "========================================="
echo " ✓ Deployment complete!"
echo " Check status: pm2 status"
echo "========================================="
