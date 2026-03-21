#!/bin/bash
# ============================================================
# setup_server.sh — Hetzner VPS Initial Setup Script
# Run once as root on a fresh Ubuntu 22.04 LTS server
# Usage: bash setup_server.sh yourdomain.com
# ============================================================

set -e

DOMAIN=${1:-"yourdomain.com"}
APP_USER="satapp"
APP_DIR="/var/www/satapp"

echo "========================================="
echo " SAT Fergana — Server Setup"
echo " Domain: $DOMAIN"
echo "========================================="

# ── System Update ─────────────────────────────────────────────
apt-get update && apt-get upgrade -y

# ── Firewall ──────────────────────────────────────────────────
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "✓ Firewall configured (ports 22, 80, 443 only)"

# ── Create App User ───────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash $APP_USER
    echo "✓ App user '$APP_USER' created"
fi

# ── Node.js LTS ───────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "✓ Node.js $(node -v) installed"

# ── PM2 ───────────────────────────────────────────────────────
npm install -g pm2
echo "✓ PM2 installed"

# ── Python 3 (System Default) ──────────────────────────────────
apt-get install -y python3 python3-venv python3-dev python3-pip
echo "✓ Python 3 installed"
# ── Nginx ─────────────────────────────────────────────────────
apt-get install -y nginx
systemctl enable --now nginx
echo "✓ Nginx installed"

# ── Certbot (Let's Encrypt) ───────────────────────────────────
apt-get install -y certbot python3-certbot-nginx
echo "✓ Certbot installed"

# ── App Directory ─────────────────────────────────────────────
mkdir -p $APP_DIR
chown -R $APP_USER:$APP_USER $APP_DIR
echo "✓ App directory created at $APP_DIR"

echo ""
echo "========================================="
echo " ✓ Server setup complete!"
echo ""
echo " Next steps:"
echo "   1. Clone repo:  git clone <url> $APP_DIR"
echo "   2. Set .env:    nano $APP_DIR/backend/.env"
echo "   3. Deploy:      bash $APP_DIR/deploy/deploy.sh"
echo "   4. Nginx:       copy nginx.conf, run certbot"
echo "   5. PM2 startup: pm2 startup && pm2 save"
echo "========================================="
