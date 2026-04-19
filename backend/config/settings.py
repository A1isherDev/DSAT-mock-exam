"""
Django settings for MockExam production project.
Reads all configuration from environment variables.
"""

import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file (dev) or system environment variables (prod)
load_dotenv(os.path.join(BASE_DIR, '.env'))


# ─── Security ────────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set!")

DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'


def _env_bool(name: str, *, default_when_unset: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default_when_unset
    return v.lower() == 'true'


# access.services — fail loud in dev (override with env in CI/prod)
LMS_AUTHZ_RAISE_ON_MISSING_SUBJECT = _env_bool(
    'LMS_AUTHZ_RAISE_ON_MISSING_SUBJECT', default_when_unset=DEBUG
)
LMS_AUTHZ_CONSISTENCY_CHECKS = _env_bool(
    'LMS_AUTHZ_CONSISTENCY_CHECKS', default_when_unset=DEBUG
)
LMS_AUTHZ_RAISE_ON_CONSISTENCY_DRIFT = _env_bool(
    'LMS_AUTHZ_RAISE_ON_CONSISTENCY_DRIFT', default_when_unset=DEBUG
)
# Log role/subject and queryset counts around test-library filters (set True to debug prod issues).
LMS_AUTHZ_DEBUG_FILTERS = _env_bool('LMS_AUTHZ_DEBUG_FILTERS', default_when_unset=False)

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
# Telegram Login Widget: bot token (server only) + bot username for the widget (public).
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
# Optional: bot username without @. If empty, the API may call Telegram getMe once (cached) to discover it.
TELEGRAM_BOT_USERNAME = os.getenv('TELEGRAM_BOT_USERNAME', '').strip().lstrip('@')
# Synthetic email domain for users without email (must stay unique per Telegram user id).
TELEGRAM_SYNTHETIC_EMAIL_DOMAIN = os.getenv(
    'TELEGRAM_SYNTHETIC_EMAIL_DOMAIN',
    'telegram.mastersat.local',
)


# ─── Application Definition ───────────────────────────────────────────────────

INSTALLED_APPS = [
    'jazzmin',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'corsheaders',

    # Local apps
    'access',
    'users',
    'exams',
    'classes',
    'realtime',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # Serve static files efficiently
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Populate JWT user before host-based API guards (DRF auth runs later per-view).
    'access.middleware.JWTUserMiddleware',
    'access.middleware.StaffSubjectRequiredMiddleware',
    'access.host_guard.SubdomainAPIGuardMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ─── Database ─────────────────────────────────────────────────────────────────
# Uses PostgreSQL in production (when DATABASE_URL is set), SQLite locally.

DATABASE_URL = os.getenv('DATABASE_URL', '')

if not DEBUG and not DATABASE_URL:
    raise ValueError("DATABASE_URL must be set in production")

if DATABASE_URL:
    import dj_database_url
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            ssl_require=os.getenv('DB_SSL', 'False').lower() == 'true',
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# Realtime + shared cache (throttles, homework metrics, alert dedupe): set in production.
REDIS_URL = os.getenv("REDIS_URL", "").strip()

# ─── Cache ─────────────────────────────────────────────────────────────────────
# Use Redis when REDIS_URL is set so throttles and homework counters are consistent across workers.
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "unique-snowflake",
        }
    }

# Production: fail fast if Redis is not configured (LocMem breaks cross-worker throttles and metrics).
CLASSROOM_ENFORCE_REDIS_CACHE = _env_bool(
    "CLASSROOM_ENFORCE_REDIS_CACHE",
    default_when_unset=(not DEBUG),
)
# Homework submit counters require a shared backend; disable only for single-process local dev.
CLASSROOM_METRICS_REQUIRE_SHARED_CACHE = _env_bool(
    "CLASSROOM_METRICS_REQUIRE_SHARED_CACHE",
    default_when_unset=(not DEBUG),
)
# Suppress duplicate CRITICAL webhook/email for the same fingerprint (seconds).
CLASSROOM_ALERT_COOLDOWN_SECONDS = int(os.getenv("CLASSROOM_ALERT_COOLDOWN_SECONDS", "900"))

# Dedupe windows (seconds): longer for low priority reduces write amplification for chatty traffic.
REALTIME_DEFAULT_DEDUPE_SECONDS = int(os.getenv("REALTIME_DEFAULT_DEDUPE_SECONDS", "2"))
REALTIME_LOW_PRIORITY_DEDUPE_SECONDS = int(os.getenv("REALTIME_LOW_PRIORITY_DEDUPE_SECONDS", "5"))
# 1.0 = persist all low-priority rows; <1.0 drops some low events before outbox (no durable replay for skipped).
REALTIME_LOW_PRIORITY_DB_SAMPLE_RATE = float(os.getenv("REALTIME_LOW_PRIORITY_DB_SAMPLE_RATE", "1.0"))
REALTIME_BULK_BATCH_SIZE = int(os.getenv("REALTIME_BULK_BATCH_SIZE", "500"))

# Backpressure (self-regulating realtime) — safe defaults, tune per environment.
REALTIME_BACKPRESSURE_ENABLED = os.getenv("REALTIME_BACKPRESSURE_ENABLED", "True").lower() == "true"
REALTIME_BP_MIN_LOW_SAMPLE_RATE = float(os.getenv("REALTIME_BP_MIN_LOW_SAMPLE_RATE", "0.05"))
REALTIME_BP_MAX_LOW_DEDUPE_SECONDS = int(os.getenv("REALTIME_BP_MAX_LOW_DEDUPE_SECONDS", "20"))
REALTIME_BP_DROP_LOW_AT_CRITICAL = os.getenv("REALTIME_BP_DROP_LOW_AT_CRITICAL", "True").lower() == "true"
REALTIME_BP_DROP_MEDIUM_AT_CRITICAL = os.getenv("REALTIME_BP_DROP_MEDIUM_AT_CRITICAL", "False").lower() == "true"

# Pressure thresholds.
REALTIME_BP_PERSISTED_PER_S_ELEVATED = float(os.getenv("REALTIME_BP_PERSISTED_PER_S_ELEVATED", "80"))
REALTIME_BP_PERSISTED_PER_S_HIGH = float(os.getenv("REALTIME_BP_PERSISTED_PER_S_HIGH", "160"))
REALTIME_BP_PERSISTED_PER_S_CRITICAL = float(os.getenv("REALTIME_BP_PERSISTED_PER_S_CRITICAL", "260"))

REALTIME_BP_LATENCY_MS_ELEVATED = float(os.getenv("REALTIME_BP_LATENCY_MS_ELEVATED", "250"))
REALTIME_BP_LATENCY_MS_HIGH = float(os.getenv("REALTIME_BP_LATENCY_MS_HIGH", "600"))
REALTIME_BP_LATENCY_MS_CRITICAL = float(os.getenv("REALTIME_BP_LATENCY_MS_CRITICAL", "1200"))

REALTIME_BP_RESYNC_PER_S_ELEVATED = float(os.getenv("REALTIME_BP_RESYNC_PER_S_ELEVATED", "0.2"))
REALTIME_BP_RESYNC_PER_S_HIGH = float(os.getenv("REALTIME_BP_RESYNC_PER_S_HIGH", "0.6"))
REALTIME_BP_RESYNC_PER_S_CRITICAL = float(os.getenv("REALTIME_BP_RESYNC_PER_S_CRITICAL", "1.2"))

REALTIME_BP_REDIS_FAIL_RATIO_ELEVATED = float(os.getenv("REALTIME_BP_REDIS_FAIL_RATIO_ELEVATED", "0.02"))
REALTIME_BP_REDIS_FAIL_RATIO_HIGH = float(os.getenv("REALTIME_BP_REDIS_FAIL_RATIO_HIGH", "0.05"))
REALTIME_BP_REDIS_FAIL_RATIO_CRITICAL = float(os.getenv("REALTIME_BP_REDIS_FAIL_RATIO_CRITICAL", "0.12"))

# Alert thresholds (used by realtime.alerts + Prometheus scrape hooks; tune per environment).
REALTIME_ALERT_MAX_RESYNC_RATIO = float(os.getenv("REALTIME_ALERT_MAX_RESYNC_RATIO", "0.12"))
REALTIME_ALERT_MIN_RESYNC_EVENTS = int(os.getenv("REALTIME_ALERT_MIN_RESYNC_EVENTS", "5"))
REALTIME_ALERT_MAX_DEDUPE_SUPPRESSION_RATIO = float(os.getenv("REALTIME_ALERT_MAX_DEDUPE_SUPPRESSION_RATIO", "0.85"))
REALTIME_ALERT_MIN_DEDUPE_EVENTS = int(os.getenv("REALTIME_ALERT_MIN_DEDUPE_EVENTS", "50"))
REALTIME_ALERT_MAX_REDIS_FAILURE_RATIO = float(os.getenv("REALTIME_ALERT_MAX_REDIS_FAILURE_RATIO", "0.05"))
REALTIME_ALERT_MIN_REDIS_FAILURES = int(os.getenv("REALTIME_ALERT_MIN_REDIS_FAILURES", "3"))

# Optional: expose emit→receive traces in logs when True or DEBUG.
REALTIME_DEBUG_TRACE = os.getenv("REALTIME_DEBUG_TRACE", "False").lower() == "true"

# SSE: DB replay polling interval per connection (seconds).
REALTIME_SSE_DB_POLL_EVERY_S = float(os.getenv("REALTIME_SSE_DB_POLL_EVERY_S", "0.8"))

# ─── Celery (optional in dev; required for scale) ─────────────────────────────
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "")
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "False").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = True

# Deadlock / serialization retries for classroom submission transactions.
CLASSROOM_DB_DEADLOCK_MAX_ATTEMPTS = int(os.getenv("CLASSROOM_DB_DEADLOCK_MAX_ATTEMPTS", "4"))
# Log CRITICAL when a StaleStorageBlob row fails this many times in a row.
CLASSROOM_STALE_STORAGE_ALERT_AFTER = int(os.getenv("CLASSROOM_STALE_STORAGE_ALERT_AFTER", "8"))

# Celery Beat (optional): stale homework file cleanup. Requires celery-beat and broker.
CELERY_BEAT_SCHEDULE = {
    "cleanup-stale-homework-storage": {
        "task": "classes.tasks.cleanup_stale_homework_storage",
        "schedule": crontab(minute="*/15"),
    },
    "prune-homework-staged-uploads": {
        "task": "classes.tasks.prune_homework_staged_uploads",
        "schedule": crontab(hour=3, minute=15),
    },
}


# ─── Password Validation ──────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ─── Internationalisation ─────────────────────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True


# ─── Static & Media Files ─────────────────────────────────────────────────────

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# WhiteNoise compression & caching
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'


# ─── Auth & JWT ───────────────────────────────────────────────────────────────

AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [
    'users.backends.EmailOrUsernameModelBackend',
    'django.contrib.auth.backends.ModelBackend',
]

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# ─── CORS ─────────────────────────────────────────────────────────────────────

CORS_ALLOW_ALL_ORIGINS = DEBUG  # Only allow all in debug mode
CORS_ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS', 'http://localhost:3000'
).split(',')

CSRF_TRUSTED_ORIGINS = [
    'http://mastersat.uz',
    'https://mastersat.uz',
    'http://www.mastersat.uz',
    'https://www.mastersat.uz',
    'https://admin.mastersat.uz',
    'https://questions.mastersat.uz',
    'http://65.109.100.104',
]


# ─── Classroom homework (submissions) ─────────────────────────────────────────
# Max size per file; comma-separated lower-case extensions including the dot (e.g. ".pdf,.png").
CLASSROOM_SUBMISSION_MAX_FILE_BYTES = int(
    os.getenv("CLASSROOM_SUBMISSION_MAX_FILE_BYTES", str(15 * 1024 * 1024))
)
CLASSROOM_SUBMISSION_ALLOWED_FILE_EXTENSIONS = frozenset(
    x.strip().lower()
    for x in os.getenv(
        "CLASSROOM_SUBMISSION_ALLOWED_FILE_EXTENSIONS",
        ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt",
    ).split(",")
    if x.strip()
)
CLASSROOM_SUBMISSION_GRADE_MIN = int(os.getenv("CLASSROOM_SUBMISSION_GRADE_MIN", "0"))
CLASSROOM_SUBMISSION_GRADE_MAX = int(os.getenv("CLASSROOM_SUBMISSION_GRADE_MAX", "100"))

# Homework grade leaderboard: minimum reviewed submissions before assigning a confident rank (null rank below).
CLASSROOM_LEADERBOARD_MIN_REVIEWED_FOR_RANK = int(os.getenv("CLASSROOM_LEADERBOARD_MIN_REVIEWED_FOR_RANK", "2"))

# Homework submission: caps and per-user submit throttle (DRF scope ``homework_submit``).
CLASSROOM_SUBMISSION_MAX_FILES_PER_SUBMISSION = int(os.getenv("CLASSROOM_SUBMISSION_MAX_FILES_PER_SUBMISSION", "50"))
CLASSROOM_SUBMISSION_MAX_BATCH_BYTES = int(
    os.getenv("CLASSROOM_SUBMISSION_MAX_BATCH_BYTES", str(100 * 1024 * 1024))
)

# Prune ``HomeworkStagedUpload`` rows (status=attached) older than this many days.
CLASSROOM_HOMEWORK_STAGED_RETENTION_DAYS = int(os.getenv("CLASSROOM_HOMEWORK_STAGED_RETENTION_DAYS", "30"))

# Ops alerting: Slack/webhook + optional email for CRITICAL homework/storage events.
# Dedupe / cooldown uses default cache (Redis in prod); see CLASSROOM_ALERT_COOLDOWN_SECONDS.
CLASSROOM_OPS_WEBHOOK_URL = os.getenv("CLASSROOM_OPS_WEBHOOK_URL", "").strip()
CLASSROOM_OPS_EMAIL_RECIPIENTS = os.getenv("CLASSROOM_OPS_EMAIL_RECIPIENTS", "").strip()


# ─── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'users.permissions.IsAuthenticatedAndNotFrozen',
    ),
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/hour',
        'burst': '60/minute',
        'sustained': '1000/day',
        'homework_submit': os.getenv('CLASSROOM_HOMEWORK_SUBMIT_THROTTLE', '120/hour'),
        'homework_submit_global': os.getenv('CLASSROOM_HOMEWORK_SUBMIT_GLOBAL_THROTTLE', '5000/hour'),
        'homework_submit_class': os.getenv('CLASSROOM_HOMEWORK_SUBMIT_PER_CLASS_THROTTLE', '800/hour'),
    }
}


# ─── Django Admin Theme ───────────────────────────────────────────────────────

JAZZMIN_SETTINGS = {
    "site_title": "MasterSAT Admin",
    "site_header": "MasterSAT Portal",
    "site_brand": "MasterSAT",
    "welcome_sign": "Welcome to the MasterSAT Admin",
    "copyright": "MasterSAT Center",
    "user_avatar": None,
    "show_ui_builder": False,
    "changeform_format": "single",
    "related_modal_active": True,
}


# ─── Security Hardening (Production only) ─────────────────────────────────────

if not DEBUG:
    # Behind Nginx/SSL termination
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

    # HSTS is powerful and can be hard to roll back.
    # Enable explicitly only after confirming HTTPS is correct for all subdomains.
    ENABLE_HSTS = os.getenv("ENABLE_HSTS", "False").lower() == "true"
    if ENABLE_HSTS:
        SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
        SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv("SECURE_HSTS_INCLUDE_SUBDOMAINS", "False").lower() == "true"
        SECURE_HSTS_PRELOAD = os.getenv("SECURE_HSTS_PRELOAD", "False").lower() == "true"


# ─── Logging ──────────────────────────────────────────────────────────────────

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING' if not DEBUG else 'DEBUG',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING' if not DEBUG else 'INFO',
            'propagate': False,
        },
    },
}


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
