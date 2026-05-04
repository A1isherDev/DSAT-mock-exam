#!/usr/bin/env bash
# ============================================================
# release_deploy.sh — Immutable release deploy + atomic cutover
#
# Prerequisites: deploy/RELEASE_LAYOUT.md (shared/*.env, media, backups)
#
# Usage (on VPS as satapp):
#   bash /var/www/satapp/deploy/release_deploy.sh origin/main
#   bash /var/www/satapp/deploy/release_deploy.sh abc123def
#   RELEASE_ID=my-id GIT_REF=main bash ...   # optional overrides
#
# Env:
#   APP_DIR=/var/www/satapp
#   APP_GIT_DIR=/var/www/satapp   # directory containing .git used for git archive
#   KEEP_LAST_N=5               # prune old release dirs
#   SKIP_PM2_RELOAD=1           # build only, no pm2 (debug)
# ============================================================
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/satapp}"
SHARED="$APP_DIR/shared"
DEPLOY_DIR="$APP_DIR/deploy"
ECOSYSTEM_FILE="$DEPLOY_DIR/ecosystem.config.js"
APP_GIT_DIR="${APP_GIT_DIR:-$APP_DIR}"
KEEP_LAST_N="${KEEP_LAST_N:-5}"
SKIP_PM2_RELOAD="${SKIP_PM2_RELOAD:-0}"

GIT_REF="${1:-${GIT_REF:-}}"
if [[ -z "$GIT_REF" ]]; then
  echo "Usage: release_deploy.sh <git-ref>"
  echo "  Example: release_deploy.sh origin/main"
  exit 1
fi

FAILED_RELEASE_DIR=""
on_error() {
  local code=$?
  echo ""
  echo "release_deploy failed (exit $code)."
  if [[ -n "$FAILED_RELEASE_DIR" ]] && [[ -d "$FAILED_RELEASE_DIR" ]]; then
    echo "Partial release dir left at: $FAILED_RELEASE_DIR"
    echo "Remove with: rm -rf \"$FAILED_RELEASE_DIR\""
  fi
  exit "$code"
}
trap on_error ERR

echo "========================================="
echo " release_deploy"
echo " APP_DIR=$APP_DIR"
echo " GIT_REF=$GIT_REF"
echo "========================================="

if [[ ! -d "$APP_GIT_DIR/.git" ]]; then
  echo "No .git at APP_GIT_DIR=$APP_GIT_DIR — set APP_GIT_DIR to your repo checkout."
  exit 1
fi
if [[ ! -f "$SHARED/backend.env" ]]; then
  echo "Missing $SHARED/backend.env — run deploy/migrate_to_release_layout.sh or create it."
  exit 1
fi
if [[ ! -f "$SHARED/frontend.env.production" ]]; then
  echo "Missing $SHARED/frontend.env.production"
  exit 1
fi
if [[ ! -f "$ECOSYSTEM_FILE" ]]; then
  echo "Missing $ECOSYSTEM_FILE"
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found; install postgresql-client"
  exit 1
fi

# --- Refuse production SQLite / missing DATABASE_URL ---
ENV_FILE="$SHARED/backend.env" python3 <<'PY'
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
debug = (vals.get("DEBUG") or "False").lower() == "true"
dburl = (vals.get("DATABASE_URL") or "").strip()
if not debug and not dburl:
    print("ERROR: DATABASE_URL required when DEBUG is not true.", file=sys.stderr)
    sys.exit(1)
PY

echo "-> Fetching git objects..."
git -C "$APP_GIT_DIR" fetch --tags origin 2>/dev/null || git -C "$APP_GIT_DIR" fetch origin 2>/dev/null || true

FULL_SHA="$(git -C "$APP_GIT_DIR" rev-parse "${GIT_REF}^{commit}")"
SHORT_SHA="$(git -C "$APP_GIT_DIR" rev-parse --short=7 "$FULL_SHA")"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d-%H%M%S)-$SHORT_SHA}"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_ID"

if [[ -e "$RELEASE_DIR" ]]; then
  echo "Release already exists: $RELEASE_DIR"
  exit 1
fi
FAILED_RELEASE_DIR="$RELEASE_DIR"

mkdir -p "$APP_DIR/releases" "$SHARED/backups" "$SHARED/media/profiles"
echo "-> Materializing tree from git archive ($FULL_SHA) -> $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
( cd "$APP_GIT_DIR" && git archive --format=tar "$FULL_SHA" ) | tar -x -C "$RELEASE_DIR"

if [[ ! -f "$RELEASE_DIR/backend/manage.py" ]]; then
  echo "Archive missing backend/manage.py"
  exit 1
fi

echo "-> Linking shared env + media"
rm -rf "$RELEASE_DIR/backend/media" 2>/dev/null || true
ln -sfn "../../../shared/backend.env" "$RELEASE_DIR/backend/.env"
ln -sfn "../../../shared/frontend.env.production" "$RELEASE_DIR/frontend/.env.production"
ln -sfn "../../../shared/media" "$RELEASE_DIR/backend/media"

echo "-> Python venv + requirements"
VENV="$RELEASE_DIR/backend/venv"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$RELEASE_DIR/backend/requirements.txt"

echo "-> Django check"
"$VENV/bin/python" "$RELEASE_DIR/backend/manage.py" check

echo "-> Frontend npm ci + build"
npm ci --prefix "$RELEASE_DIR/frontend" --no-audit --no-fund
npm run build --prefix "$RELEASE_DIR/frontend"

echo "-> Stop app processes (avoid mixed schema / dead API during migrate)"
pm2 stop sat-frontend 2>/dev/null || true
pm2 stop sat-celery-worker 2>/dev/null || true
pm2 stop sat-celery-beat 2>/dev/null || true
pm2 stop sat-backend 2>/dev/null || true

DUMP="$SHARED/backups/pg_${RELEASE_ID}_pre.dump"
echo "-> pg_dump -> $DUMP"
DBURL="$("$VENV/bin/python" -c "
from pathlib import Path
from dotenv import dotenv_values
vals = dotenv_values(Path('$SHARED') / 'backend.env')
print((vals.get('DATABASE_URL') or '').strip())
")"
if [[ -z "$DBURL" ]]; then
  echo "DATABASE_URL empty in shared/backend.env"
  exit 1
fi
pg_dump "$DBURL" --no-owner --no-acl -Fc -f "$DUMP"

echo "-> migrate + collectstatic"
"$VENV/bin/python" "$RELEASE_DIR/backend/manage.py" migrate --no-input
mkdir -p "$RELEASE_DIR/backend/staticfiles"
"$VENV/bin/python" "$RELEASE_DIR/backend/manage.py" collectstatic --no-input

OLD_CURRENT_REAL=""
if [[ -L "$APP_DIR/current" ]]; then
  OLD_CURRENT_REAL="$(readlink -f "$APP_DIR/current" || true)"
fi

echo "-> Atomic symlink: current -> $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$APP_DIR/current"

if [[ -n "$OLD_CURRENT_REAL" ]] && [[ -d "$OLD_CURRENT_REAL" ]] && [[ "$OLD_CURRENT_REAL" != "$(readlink -f "$RELEASE_DIR")" ]]; then
  ln -sfn "$OLD_CURRENT_REAL" "$APP_DIR/previous"
  echo "-> previous -> $OLD_CURRENT_REAL"
fi

COMMIT_MSG="$(git -C "$APP_GIT_DIR" log -1 --oneline "$FULL_SHA" 2>/dev/null || echo "")"
export RD_RELEASE_DIR="$RELEASE_DIR"
export RD_FULL_SHA="$FULL_SHA"
export RD_SHORT_SHA="$SHORT_SHA"
export RD_GIT_REF="$GIT_REF"
export RD_COMMIT_MSG="$COMMIT_MSG"
python3 <<'PY'
import json
import os
from pathlib import Path

rd = os.environ["RD_RELEASE_DIR"]
meta = {
    "release_id": Path(rd).name,
    "git_sha": os.environ["RD_FULL_SHA"],
    "git_short": os.environ["RD_SHORT_SHA"],
    "git_ref_requested": os.environ["RD_GIT_REF"],
    "commit_oneline": os.environ.get("RD_COMMIT_MSG", ""),
}
Path(rd, "RELEASE.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
PY

STATE_FILE="$SHARED/release_state.json"
PREV_ID=""
if [[ -n "$OLD_CURRENT_REAL" ]] && [[ -d "$OLD_CURRENT_REAL" ]]; then
  PREV_ID="$(basename "$OLD_CURRENT_REAL")"
fi
export SD_STATE_FILE="$STATE_FILE"
export SD_ACTIVE="$RELEASE_ID"
export SD_PREV="$PREV_ID"
export SD_SHA="$FULL_SHA"
export SD_DUMP="$DUMP"
python3 <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

p = Path(os.environ["SD_STATE_FILE"])
state = {
    "active_release_id": os.environ["SD_ACTIVE"],
    "previous_release_id": os.environ.get("SD_PREV", ""),
    "git_sha": os.environ["SD_SHA"],
    "rollback_db_dump": os.environ["SD_DUMP"],
    "updated_at": datetime.now(timezone.utc).isoformat(),
}
p.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY

if [[ "$SKIP_PM2_RELOAD" == "1" ]]; then
  echo "-> SKIP_PM2_RELOAD=1 — not touching PM2"
else
  echo "-> PM2 startOrReload"
  pm2 startOrReload "$ECOSYSTEM_FILE" --update-env || pm2 start "$ECOSYSTEM_FILE"
  pm2 save
fi

echo "-> Prune old releases (keep $KEEP_LAST_N)"
if [[ -d "$APP_DIR/releases" ]] && [[ "$KEEP_LAST_N" =~ ^[0-9]+$ ]] && [[ "$KEEP_LAST_N" -gt 0 ]]; then
  CUR_BN=""
  if [[ -L "$APP_DIR/current" ]]; then
    CUR_BN="$(basename "$(readlink -f "$APP_DIR/current")")"
  fi
  # shellcheck disable=SC2012
  mapfile -t ALL < <(ls -1t "$APP_DIR/releases" 2>/dev/null || true)
  i=0
  for name in "${ALL[@]}"; do
    [[ -z "$name" ]] && continue
    ((i++)) || true
    if [[ "$i" -le "$KEEP_LAST_N" ]]; then
      continue
    fi
    if [[ "$name" == "$CUR_BN" ]]; then
      continue
    fi
    PREV_BN=""
    if [[ -L "$APP_DIR/previous" ]]; then
      PREV_BN="$(basename "$(readlink -f "$APP_DIR/previous" 2>/dev/null)" 2>/dev/null || true)"
    fi
    if [[ "$name" == "$PREV_BN" ]]; then
      continue
    fi
    echo "   Removing old release: $name"
    rm -rf "${APP_DIR:?}/releases/${name}"
  done
fi

FAILED_RELEASE_DIR=""
trap - ERR
echo ""
echo "========================================="
echo " Release $RELEASE_ID deployed."
echo " current -> $RELEASE_DIR"
echo " Rollback DB snapshot: $DUMP"
echo "========================================="
