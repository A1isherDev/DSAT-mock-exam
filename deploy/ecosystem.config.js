// ============================================================
// ecosystem.config.js — PM2 Process Manager Configuration
//
// Paths use /current so each deploy is an atomic symlink swap
// (see deploy/RELEASE_LAYOUT.md and deploy/release_deploy.sh).
// Legacy in-place deploys: run deploy/deploy.sh (fixed paths) or
// migrate with deploy/migrate_to_release_layout.sh then release_deploy.
// ============================================================

const backendCwd = '/var/www/satapp/current/backend';
const frontendCwd = '/var/www/satapp/current/frontend';
const venvGunicorn = '/var/www/satapp/current/backend/venv/bin/gunicorn';
const venvCelery = '/var/www/satapp/current/backend/venv/bin/celery';

module.exports = {
  apps: [
    {
      // ── Next.js Frontend ──────────────────────────────────
      name: 'sat-frontend',
      cwd: frontendCwd,
      script: 'npm',
      args: 'run start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // ── Django Backend (Gunicorn) ─────────────────────────
      name: 'sat-backend',
      cwd: backendCwd,
      script: venvGunicorn,
      args:
        'config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120 --access-logfile - --error-logfile -',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        DJANGO_SETTINGS_MODULE: 'config.settings',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // ── Celery worker (same venv + code as Gunicorn) ───────
      name: 'sat-celery-worker',
      cwd: backendCwd,
      script: venvCelery,
      args: '-A config worker -l INFO --concurrency 2',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        DJANGO_SETTINGS_MODULE: 'config.settings',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // ── Celery beat (single host only; delete if beat runs elsewhere)
      name: 'sat-celery-beat',
      cwd: backendCwd,
      script: venvCelery,
      args: '-A config beat -l INFO',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        DJANGO_SETTINGS_MODULE: 'config.settings',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
