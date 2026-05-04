#!/usr/bin/env bash
# ============================================================
# rollback.sh — Point current at previous release + optional DB restore
#
# Default: read shared/release_state.json (rollback_db_dump) and
#          shared/../previous symlink; stop PM2; pg_restore; flip current;
#          restart PM2.
#
# Usage:
#   bash /var/www/satapp/deploy/rollback.sh
#   bash /var/www/satapp/deploy/rollback.sh --no-db
#   bash /var/www/satapp/deploy/rollback.sh --dump /path/to.dump
#   bash /var/www/satapp/deploy/rollback.sh --release /var/www/satapp/releases/SOME_ID
#   bash /var/www/satapp/deploy/rollback.sh --purge-celery
#
# Env:
#   APP_DIR=/var/www/satapp
# ============================================================
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
SHARED="$APP_DIR/shared"
STATE_FILE="$SHARED/release_state.json"
ECOSYSTEM_FILE="$APP_DIR/deploy/ecosystem.config.js"

NO_DB="0"
DUMP_OVERRIDE=""
RELEASE_OVERRIDE=""
PURGE_CELERY="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-db) NO_DB="1"; shift ;;
    --dump) DUMP_OVERRIDE="${2:-}"; shift 2 ;;
    --release) RELEASE_OVERRIDE="${2:-}"; shift 2 ;;
    --purge-celery) PURGE_CELERY="1"; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "========================================="
echo " rollback.sh  APP_DIR=$APP_DIR"
echo "========================================="

if [[ ! -f "$ECOSYSTEM_FILE" ]]; then
  echo "Missing $ECOSYSTEM_FILE"
  exit 1
fi

OLD_CURRENT=""
if [[ -L "$APP_DIR/current" ]]; then
  OLD_CURRENT="$(readlink -f "$APP_DIR/current" || true)"
fi

TARGET_RELEASE=""
if [[ -n "$RELEASE_OVERRIDE" ]]; then
  TARGET_RELEASE="$(readlink -f "$RELEASE_OVERRIDE" 2>/dev/null || true)"
  if [[ ! -d "$TARGET_RELEASE" ]] || [[ ! -f "$TARGET_RELEASE/backend/manage.py" ]]; then
    echo "Invalid --release: $RELEASE_OVERRIDE"
    exit 1
  fi
elif [[ -L "$APP_DIR/previous" ]]; then
  TARGET_RELEASE="$(readlink -f "$APP_DIR/previous" || true)"
  if [[ ! -d "$TARGET_RELEASE" ]]; then
    echo "Broken or missing previous symlink target."
    exit 1
  fi
else
  echo "No $APP_DIR/previous symlink and no --release. Cannot determine rollback target."
  exit 1
fi

DUMP_PATH="$DUMP_OVERRIDE"
if [[ -z "$DUMP_PATH" ]] && [[ "$NO_DB" != "1" ]]; then
  if [[ -f "$STATE_FILE" ]]; then
    DUMP_PATH="$(RB_STATE_FILE="$STATE_FILE" python3 <<'PY'
import json
import os
from pathlib import Path

p = Path(os.environ["RB_STATE_FILE"])
data = json.loads(p.read_text(encoding="utf-8"))
print((data.get("rollback_db_dump") or "").strip())
PY
)"
  fi
fi

if [[ "$NO_DB" != "1" ]]; then
  if [[ -z "$DUMP_PATH" ]] || [[ ! -f "$DUMP_PATH" ]]; then
    echo "No database dump found (see $STATE_FILE rollback_db_dump or pass --dump)."
    echo "Use --no-db to only switch the current symlink."
    exit 1
  fi
  if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
    echo "pg_restore and psql required (postgresql-client)."
    exit 1
  fi
fi

echo "-> Stop PM2 processes"
pm2 stop sat-frontend 2>/dev/null || true
pm2 stop sat-celery-worker 2>/dev/null || true
pm2 stop sat-celery-beat 2>/dev/null || true
pm2 stop sat-backend 2>/dev/null || true

if [[ "$NO_DB" != "1" ]]; then
  echo "-> Restore PostgreSQL from $DUMP_PATH"
  DBURL="$(ENV_FILE="$SHARED/backend.env" python3 <<'PY'
import os
import sys
from pathlib import Path

def load_simple(path: Path) -> dict:
    out = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip("'").strip('"')
        out[k] = v
    return out

p = Path(os.environ["ENV_FILE"])
vals = load_simple(p)
u = (vals.get("DATABASE_URL") or "").strip()
if not u:
    print("DATABASE_URL missing", file=sys.stderr)
    sys.exit(1)
print(u)
PY
)"
  psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" >/dev/null
  set +e
  pg_restore -d "$DBURL" --no-owner --no-acl --clean --if-exists "$DUMP_PATH"
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]] && [[ "$rc" -ne 1 ]]; then
    echo "pg_restore failed (exit $rc). See PostgreSQL logs."
    exit "$rc"
  fi
  if [[ "$rc" -eq 1 ]]; then
    echo "pg_restore completed with warnings (exit 1); continuing."
  fi
fi

echo "-> Point current -> $TARGET_RELEASE"
ln -sfn "$TARGET_RELEASE" "$APP_DIR/current"

if [[ "$PURGE_CELERY" == "1" ]]; then
  CELERY_BIN="$APP_DIR/current/backend/venv/bin/celery"
  if [[ -x "$CELERY_BIN" ]]; then
    echo "-> Celery purge (-f)"
    ( cd "$APP_DIR/current/backend" && "$CELERY_BIN" -A config purge -f ) || echo "WARN: celery purge failed (broker down?)"
  else
    echo "WARN: $CELERY_BIN missing; skip purge"
  fi
fi

echo "-> PM2 startOrReload"
pm2 startOrReload "$ECOSYSTEM_FILE" --update-env || pm2 start "$ECOSYSTEM_FILE"
pm2 save

NEW_ACTIVE="$(basename "$TARGET_RELEASE")"
OLD_ACTIVE=""
if [[ -n "$OLD_CURRENT" ]] && [[ -d "$OLD_CURRENT" ]]; then
  OLD_ACTIVE="$(basename "$OLD_CURRENT")"
fi

export RB_APP_DIR="$APP_DIR"
export RB_STATE="$STATE_FILE"
export RB_ACTIVE="$NEW_ACTIVE"
export RB_PREV="$OLD_ACTIVE"
export RB_DUMP="$DUMP_PATH"
python3 <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

p = Path(os.environ["RB_STATE"])
state = {}
if p.exists():
    try:
        state = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        state = {}

state["active_release_id"] = os.environ["RB_ACTIVE"]
state["previous_release_id"] = os.environ.get("RB_PREV", "")
if os.environ.get("RB_DUMP"):
    state["rollback_db_dump"] = os.environ["RB_DUMP"]
state["last_action"] = "rollback"
state["updated_at"] = datetime.now(timezone.utc).isoformat()

meta = Path(os.environ["RB_APP_DIR"]) / "current" / "RELEASE.json"
if meta.exists():
    try:
        rel = json.loads(meta.read_text(encoding="utf-8"))
        if rel.get("git_sha"):
            state["git_sha"] = rel["git_sha"]
    except json.JSONDecodeError:
        pass

p.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY

if [[ -n "$OLD_ACTIVE" ]] && [[ "$OLD_ACTIVE" != "$NEW_ACTIVE" ]]; then
  if [[ -n "$OLD_CURRENT" ]] && [[ -d "$OLD_CURRENT" ]]; then
    ln -sfn "$OLD_CURRENT" "$APP_DIR/previous"
    echo "-> previous -> (rolled-back release) $OLD_CURRENT"
  fi
fi

echo ""
echo "========================================="
echo " Rollback complete. current -> $TARGET_RELEASE"
echo "========================================="
