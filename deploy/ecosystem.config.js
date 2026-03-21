// ============================================================
// ecosystem.config.js — PM2 Process Manager Configuration
// ============================================================

module.exports = {
  apps: [
    {
      // ── Next.js Frontend ──────────────────────────────────
      name: 'sat-frontend',
      cwd: '/var/www/satapp/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/sat-frontend-error.log',
      out_file: '/var/log/pm2/sat-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // ── Django Backend (Gunicorn) ─────────────────────────
      name: 'sat-backend',
      cwd: '/var/www/satapp/backend',
      script: '/var/www/satapp/backend/venv/bin/gunicorn',
      args: 'config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120 --access-logfile - --error-logfile -',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        DJANGO_SETTINGS_MODULE: 'config.settings',
      },
      error_file: '/var/log/pm2/sat-backend-error.log',
      out_file: '/var/log/pm2/sat-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
