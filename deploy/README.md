# 🚀 Deployment Guide — MasterSAT Mock Exam

## Prerequisites

- Hetzner VPS running **Ubuntu 22.04 LTS** (minimum 2GB RAM)
- A domain name pointed to your VPS IP
- SSH access to the server

---

## Step 1 — Initial Server Setup (Run Once)

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Upload and run the setup script
bash /path/to/deploy/setup_server.sh yourdomain.com
```

This installs: Node.js, PM2, Python 3.12, Nginx, Certbot.

---

## Step 2 — Clone the Repository

```bash
su - satapp
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /var/www/satapp
```

---

## Step 3 — Configure Environment Variables

### Backend
```bash
cp /var/www/satapp/backend/.env.example /var/www/satapp/backend/.env
nano /var/www/satapp/backend/.env
```

Fill in:
```env
SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(50))">
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/DBNAME
DB_SSL=False
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

Production uses **PostgreSQL** when `DEBUG=False` (`DATABASE_URL` is required). Local dev can omit `DATABASE_URL` to use SQLite.

User profile photos are stored under `backend/media/profiles/`; `deploy.sh` creates this path. Nginx must serve `/media/` (see `deploy/nginx.conf`).

### Frontend
```bash
nano /var/www/satapp/frontend/.env.production
```
Update:
```env
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

---

## Step 4 — Run Deployment

Use the script from **any** directory (it uses absolute paths and `npm --prefix` for the frontend):

```bash
bash /var/www/satapp/deploy/deploy.sh
```

Do **not** run plain `npm ci` or `npm run build` while your shell’s current directory is `deploy/` unless you only mean the tiny shim `package.json` there. The Next.js app and its real `package-lock.json` live under **`frontend/`**. `deploy/package-lock.json` is gitignored (optional local file only); **`deploy.sh` removes an untracked copy before `git pull`** so merges are not blocked on old servers.

If you install or build the frontend by hand on the server, use one of:

```bash
cd /var/www/satapp/frontend && npm ci --no-audit --no-fund && npm run build
```

Or from the repo root:

```bash
npm ci --prefix /var/www/satapp/frontend --no-audit --no-fund
npm run build --prefix /var/www/satapp/frontend
```

Or from `deploy/` (scripts delegate to `../frontend`):

```bash
cd /var/www/satapp/deploy && npm run ci:frontend && npm run build:frontend
```

This will:
1. Pull latest code
2. Install Python deps + run migrations + collect static
3. Install Node deps + build Next.js
4. Start/reload PM2 services

---

## Step 5 — Configure Nginx

```bash
sudo cp /var/www/satapp/deploy/nginx.conf /etc/nginx/sites-available/satapp
# Edit the domain name in the file
sudo nano /etc/nginx/sites-available/satapp

sudo ln -s /etc/nginx/sites-available/satapp /etc/nginx/sites-enabled/
sudo nginx -t   # Test config
sudo systemctl reload nginx
```

---

## Step 6 — Enable SSL (HTTPS)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will auto-fill the SSL block in your Nginx config and set up auto-renewal.

---

## Step 7 — PM2 Auto-start on Reboot

```bash
pm2 startup systemd -u satapp --hp /home/satapp
pm2 save
```

---

## Verification Checklist

```bash
pm2 status                          # Both services should be "online"
sudo nginx -t                       # Nginx config OK
curl https://yourdomain.com/api/    # API responds
curl https://yourdomain.com         # Frontend loads
python3 manage.py check --deploy    # Django deploy checklist passes
```

---

## Ongoing Deployments

After pushing code changes to git:

**1. Database backup (PostgreSQL production, recommended before every deploy):**

```bash
ssh satapp@YOUR_SERVER_IP
bash /var/www/satapp/deploy/backup_postgres.sh
```

This writes a custom-format dump under `/var/www/satapp/backups/pg_backup_YYYY-MM-DD_HHMMSS.dump`.

**2. Deploy application:**

```bash
bash /var/www/satapp/deploy/deploy.sh
```

---

## Post-deploy smoke tests + rollback

Run the release smoke suite **immediately after deploy** and rollback if it fails.

- **Smoke runner**: `deploy/run_post_deploy_smoke.sh`
- **Playwright spec**: `frontend/tests/e2e/release_smoke_api.spec.ts`

Suggested pipeline:

- Deploy new version
- Run `deploy/run_post_deploy_smoke.sh` with `PLAYWRIGHT_BASE_URL=https://yourdomain.com`
- If smoke fails: rollback to the previous release (previous image/tag) and page on-call

## Useful Commands

```bash
pm2 status                  # Check service status
pm2 logs sat-backend        # Backend logs
pm2 logs sat-frontend       # Frontend logs
pm2 restart all             # Restart all services
sudo tail -f /var/log/nginx/satapp-error.log  # Nginx errors
```

---

## Security Checklist

- [ ] `DEBUG=False` in backend `.env`
- [ ] Unique `SECRET_KEY` generated
- [ ] UFW firewall active (ports 22, 80, 443 only)
- [ ] SSL certificate installed
- [ ] Root SSH login disabled (optional): `PermitRootLogin no` in `/etc/ssh/sshd_config`
