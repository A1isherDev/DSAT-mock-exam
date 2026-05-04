#!/usr/bin/env bash
# ============================================================
# rollback.sh — Roll back current/ + optional PostgreSQL restore
#
# Uses the same deploy lock as release_deploy.sh (blocking wait).
#
# Database restore uses ONLY:
#   - absolute path in shared/release_state.json -> rollback_db_dump, OR
#   - absolute path from --dump /path/to.dump
# No timestamp guessing or inferred paths.
#
# Usage:
#   bash /var/www/satapp/deploy/rollback.sh
#   bash /var/www/satapp/deploy/rollback.sh --no-db
#   bash /var/www/satapp/deploy/rollback.sh --dump /var/www/satapp/shared/backups/pg_XXX_pre.dump
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
LOCK_FILE="$SHARED/.deploy.lock"
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
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown option: $1"; exit 1 ;;
  esac
done

release_lock() {
  flock -u 9 2>/dev/null || true
  exec 9>&- 2>/dev/null || true
}

mkdir -p "$SHARED"
exec 9>>"$LOCK_FILE"
echo "-> Waiting for deploy lock: $LOCK_FILE"
flock 9
trap 'release_lock' EXIT

echo "========================================="
echo " rollback.sh (locked)  APP_DIR=$APP_DIR"
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

DUMP_PATH=""
if [[ "$NO_DB" == "1" ]]; then
  if [[ -n "$DUMP_OVERRIDE" ]]; then
    echo "--dump is ignored with --no-db"
  fi
else
  if [[ -n "$DUMP_OVERRIDE" ]]; then
    DUMP_PATH="$(readlink -f "$DUMP_OVERRIDE" 2>/dev/null || true)"
    if [[ "$DUMP_PATH" != /* ]]; then
      echo "[FAIL] --dump must be an absolute path; got: $DUMP_OVERRIDE"
      exit 1
    fi
    if [[ ! -f "$DUMP_PATH" ]]; then
      echo "[FAIL] --dump file not found: $DUMP_PATH"
      exit 1
    fi
  else
    if [[ ! -f "$STATE_FILE" ]]; then
      echo "[FAIL] Missing $STATE_FILE — cannot read rollback_db_dump."
      echo "       Pass an explicit dump: rollback.sh --dump /absolute/path/to.dump"
      exit 1
    fi
    DUMP_PATH="$(RB_STATE="$STATE_FILE" python3 <<'PY'
import json
import os
import sys
from pathlib import Path

p = Path(os.environ["RB_STATE"])
try:
    data = json.loads(p.read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    print(f"invalid JSON in state file: {e}", file=sys.stderr)
    sys.exit(1)

raw = (data.get("rollback_db_dump") or "").strip()
if not raw:
    print("rollback_db_dump missing or empty in state file", file=sys.stderr)
    sys.exit(1)
path = Path(raw)
if not path.is_absolute():
    print("rollback_db_dump must be an absolute path", file=sys.stderr)
    sys.exit(1)
if not path.is_file():
    print(f"rollback_db_dump file does not exist: {path}", file=sys.stderr)
    sys.exit(1)
print(path.resolve())
PY
)"
    if [[ -z "$DUMP_PATH" ]]; then
      echo "[FAIL] Could not resolve rollback_db_dump from $STATE_FILE"
      exit 1
    fi
  fi

  if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
    echo "pg_restore and psql required (postgresql-client)."
    exit 1
  fi
fi

echo "-> Stop and remove Celery PM2 apps (no stale workers)"
pm2 stop sat-celery-worker 2>/dev/null || true
pm2 stop sat-celery-beat 2>/dev/null || true
pm2 delete sat-celery-worker 2>/dev/null || true
pm2 delete sat-celery-beat 2>/dev/null || true
pm2 stop sat-backend 2>/dev/null || true
pm2 stop sat-frontend 2>/dev/null || true
sleep 1

if [[ "$NO_DB" != "1" ]]; then
  echo "-> Restore PostgreSQL from explicit dump: $DUMP_PATH"
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
dump = os.environ.get("RB_DUMP", "").strip()
if dump:
    dp = Path(dump)
    if dp.is_absolute() and dp.is_file():
        state["rollback_db_dump"] = str(dp.resolve())
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
    echo "-> previous -> (rolled-back-from) $OLD_CURRENT"
  fi
fi

echo ""
echo "========================================="
echo " Rollback complete. current -> $TARGET_RELEASE"
if [[ "$NO_DB" != "1" ]]; then
  echo " DB restored from: $DUMP_PATH"
fi
echo "========================================="
