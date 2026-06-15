# Classroom Rebuild — Deploy Preparation & Migration Verification

Target: merge `feat/classroom-rebuild` → release. Prod deploys via `release_deploy.sh`
(current-symlink release layout; **not** `deploy.sh`).

## 1. Migration verification — ✅ done
| Check | Result |
|---|---|
| `makemigrations classes --check --dry-run` | **No changes detected** (models == migrations, no drift) |
| New migrations | `0020` (assignment category/max_score, membership status+roles, attendance, rankings, configs, goals), `0021` (assignment status/published_at/archived_at), `0022` (submissionreview.is_auto) |
| Nature | **Additive only** — new fields/tables; no destructive column drops/renames |
| Forward apply (0019→0022) | ✅ clean |
| Reverse (0022→0019) then re-apply | ✅ clean (rollback-safe) |
| Schema builds from model state | ✅ (79-test no-migrations harness + fresh `uat.sqlite3` build) |

**Known pre-existing issue (not a blocker for prod):** a from-zero `migrate` trips a historical
conflict in `exams` (`duplicate column option_a_image` / `questions.module_id`). This predates the
rebuild and does **not** affect production, which applies migrations **incrementally** on an
already-consistent schema (prod already has `0019`). It only affects building a DB from scratch
locally — hence `settings_uat` / `settings_test_nomigrations`. Track a separate `exams`
migration-history squash for fresh-environment provisioning.

## 2. Pre-deploy gates (run in CI / staging)
- [ ] `python manage.py makemigrations --check` (all apps) → no ungenerated migrations.
- [ ] `python manage.py test classes` → **79 passing** (verified locally via no-migrations harness).
- [ ] `npm run build` (frontend) → production build compiles. *(Classroom scope is tsc+eslint clean; run the full build in CI to catch any unrelated page issues.)*
- [ ] `python manage.py check --deploy` on the release settings.
- [ ] Confirm the 3 pre-existing `assessments` security-matrix failures are tracked (access-engine-v2), not introduced here.

## 3. Environment
- **No new environment variables.** The rebuild adds no new settings keys.
- `config/settings_uat.py` and `config/settings_test_nomigrations.py` are **dev/UAT only** — never referenced by the production `DJANGO_SETTINGS_MODULE`.
- No new external services/queues required. (The daily ranking/analytics snapshot job is **deferred**; recompute runs on-completion + via the manual endpoint — no scheduler dependency for launch.)

## 4. Deploy steps
1. Merge to the release branch (see merge note below).
2. `release_deploy.sh` (standard path): pull, `pip install -r requirements.txt`, `npm ci && npm run build`, `python manage.py migrate` (applies 0020–0022 incrementally), `collectstatic`, swap current symlink, reload gunicorn.
3. Migrations 0020–0022 are additive → safe to apply with the app briefly live; prefer a short maintenance window for the membership/assignment table alterations.

## 5. Post-deploy smoke (prod)
- [ ] `GET /api/classes/` (as a member) → 200.
- [ ] Open a real classroom → Gradebook, Rankings (SAT + Academic), Attendance, Analytics render.
- [ ] `showmigrations classes` → 0020–0022 `[X]`.
- [ ] Create a draft assignment → not visible to a student; publish → visible.
- [ ] Complete an auto-graded practice → appears Graded (not in Needs grading).

## 6. Rollback
- Migrations are reversible: `migrate classes 0019` unwinds 0020–0022 cleanly (additive).
- Release rollback: repoint the `current` symlink to the previous release (standard `release_deploy.sh` rollback).
- No data backfill is required to roll back (new columns/tables are additive; existing rows default to PUBLISHED / non-auto).

## 7. Risk register
| Risk | Severity | Mitigation |
|---|---|---|
| No automated browser E2E | Medium | Execute `UAT_CHECKLIST.md` on staging before GA. |
| `exams` from-zero migration drift | Low (prod) | Doesn't affect incremental prod apply; squash separately for fresh envs. |
| 3 pre-existing `assessments` auth failures | Low (external) | Resolve by merging access-engine-v2. |
| Daily snapshot job not wired | Low | History accrues on recompute; add scheduler post-launch. |
