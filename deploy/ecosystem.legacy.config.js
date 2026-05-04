// ============================================================
// ecosystem.legacy.config.js — PM2 for in-place /var/www/satapp
// layout (deploy/deploy.sh). Does not use /current or Celery.
// Release deploys: use ecosystem.config.js + release_deploy.sh.
// ============================================================

module.exports = {
  apps: [
    {
      name: 'sat-frontend',
      cwd: '/var/www/satapp/frontend',
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
      name: 'sat-backend',
      cwd: '/var/www/satapp/backend',
      script: '/var/www/satapp/backend/venv/bin/gunicorn',
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
  ],
};
