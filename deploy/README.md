# Deployment Guide — MasterSAT Mock Exam

## Prerequisites

- Hetzner VPS running **Ubuntu 22.04 LTS** (minimum 2GB RAM)
- A domain name pointed to your VPS IP
- SSH access to the server

---

## Production layout (recommended)

Immutable **releases** under `/var/www/satapp/releases/<RELEASE_ID>/`, a **`current`** symlink, and **`shared/`** for secrets and media. See **[RELEASE_LAYOUT.md](RELEASE_LAYOUT.md)** for the full diagram and one-time migration.

**Canonical deploy command:**

```bash
bash /var/www/satapp/deploy/release_deploy.sh origin/main
```

This acquires a **non-blocking flock** on `shared/.deploy.lock` (no concurrent deploys), builds from `git archive`, stops Celery (including `pm2 delete` so workers cannot linger), runs `pg_dump` (pre-migrate), runs **`migrate` only from the new release’s venv** (before `current/` changes), `collectstatic`, then **`check --deploy`**, **`migrate --check`**, and static/`.next` sanity checks **before** flipping `current/`. If anything fails after the symlink (for example PM2 reload), `current/` is **reverted** to the prior release when possible. `shared/release_state.json` is written **only after** a successful PM2 reload, with an **absolute** `rollback_db_dump` path.

Optional env: `SKIP_HEALTH_CHECKS=1` (emergency only), `SKIP_PM2_RELOAD=1` (debug), `AUTO_DB_RESTORE_ON_FAIL=0` (disable automatic `pg_restore` on failure after migrate), `DEPLOY_HEALTH_URL=` (empty skips post-cutover HTTP curl), `PM2_ONLINE_WAIT_S=45`, `KEEP_BACKUP_DUMPS_N=40` (retain newest N `pg_*.dump` files under `shared/backups/`; this deploy’s dump is never deleted in that pass).

**Rollback (code + DB to state before last cutover):**

```bash
bash /var/www/satapp/deploy/rollback.sh
```

Uses the **same lock file** (blocking wait). DB restore uses **only** `rollback_db_dump` from `release_state.json` (must be an absolute path to an existing file) or **`--dump /absolute/path/to.dump`**. No path guessing. Options: `--no-db` (symlink only), `--release ...`, `--purge-celery`.

**PM2** uses [`ecosystem.config.js`](ecosystem.config.js): `sat-frontend`, `sat-backend`, `sat-celery-worker`, `sat-celery-beat` (all under `/var/www/satapp/current/...`). If you run Celery beat on another host, `pm2 delete sat-celery-beat` on this server.

**Nginx** must serve static from `current` and media from `shared` (see [`nginx.conf`](nginx.conf)).

---

## Step 1 — Initial Server Setup (Run Once)

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Upload and run the setup script
bash /path/to/deploy/setup_server.sh yourdomain.com
```

This installs: Node.js, PM2, Python 3, Nginx, Certbot. Install **`postgresql-client`** on the app host for `pg_dump` / `pg_restore` / `psql`.

---

## Step 2 — Clone the Repository

```bash
su - satapp
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /var/www/satapp
```

---

## Step 3 — First-time migration to `shared/` + releases

```bash
bash /var/www/satapp/deploy/migrate_to_release_layout.sh
```

Creates `shared/`, moves `backend/.env` → `shared/backend.env` and `frontend/.env.production` → `shared/frontend.env.production`, syncs media into `shared/media/`, and prepares `releases/`.

Fill secrets if the script reported missing files:

```bash
chmod 600 /var/www/satapp/shared/backend.env /var/www/satapp/shared/frontend.env.production
```

Example `shared/backend.env` (same variables as before):

```env
SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(50))">
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/DBNAME
DB_SSL=False
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com
REDIS_URL=redis://127.0.0.1:6379/0
CELERY_BROKER_URL=redis://127.0.0.1:6379/1
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/2
```

`shared/frontend.env.production`:

```env
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

User profile photos live under **`shared/media/profiles/`** (Nginx `alias` in `nginx.conf`).

---

## Step 4 — Configure Nginx (release paths)

```bash
sudo cp /var/www/satapp/deploy/nginx.conf /etc/nginx/sites-available/satapp
# Edit server_name if needed
sudo nginx -t && sudo systemctl reload nginx
```

Static files: `/var/www/satapp/current/backend/staticfiles/`. Media: `/var/www/satapp/shared/media/`.

---

## Step 5 — First release + PM2

```bash
bash /var/www/satapp/deploy/release_deploy.sh origin/main
pm2 status
```

---

## Step 6 — Enable SSL (HTTPS)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Step 7 — PM2 Auto-start on Reboot

```bash
pm2 startup systemd -u satapp --hp /home/satapp
pm2 save
```

---

## Verification Checklist

```bash
pm2 status
sudo nginx -t
curl https://yourdomain.com/api/
curl https://yourdomain.com
```

---

## Ongoing releases

```bash
bash /var/www/satapp/deploy/release_deploy.sh origin/main
# or a SHA:  bash ... abc123def
```

Optional: `KEEP_LAST_N=10` to retain more release directories. `SKIP_PM2_RELOAD=1` builds only (debug).

**Manual backup** (any time):

```bash
bash /var/www/satapp/deploy/backup_postgres.sh
```

Writes a custom-format dump under `shared/backups/` (or `backups/` on legacy trees).

---

## Post-deploy smoke + rollback

- **Smoke runner**: `deploy/run_post_deploy_smoke.sh`
- **Playwright spec**: `frontend/tests/e2e/release_smoke_api.spec.ts`

If smoke fails after a release:

```bash
bash /var/www/satapp/deploy/rollback.sh
```

---

## Legacy in-place deploy (no `releases/`)

`deploy/deploy.sh` still supports a flat tree at `/var/www/satapp` (`git pull`, venv under `backend/venv`, etc.). It uses **[ecosystem.legacy.config.js](ecosystem.legacy.config.js)** (only `sat-frontend` + `sat-backend`). Override with `ECOSYSTEM_FILE=...` if needed.

Do **not** run plain `npm ci` from `deploy/` expecting the Next app; use `frontend/` as documented in older notes:

```bash
npm ci --prefix /var/www/satapp/frontend --no-audit --no-fund
npm run build --prefix /var/www/satapp/frontend
```

---

## Useful Commands

```bash
pm2 status
pm2 logs sat-backend
pm2 logs sat-frontend
pm2 logs sat-celery-worker
sudo tail -f /var/log/nginx/satapp-error.log
```

---

## Security Checklist

- [ ] `DEBUG=False` in `shared/backend.env`
- [ ] Unique `SECRET_KEY` generated
- [ ] UFW firewall active (ports 22, 80, 443 only)
- [ ] SSL certificate installed
- [ ] Root SSH login disabled (optional): `PermitRootLogin no` in `/etc/ssh/sshd_config`
