# Phase 2 — Implementation Summary

Branch: `feat/access-engine-v2` (7 isolated commits on top of `main`).
Status: **Engine built, tested, prod-inert.** Nothing flipped on; production
behavior unchanged. Awaiting deploy-gate approval before any flag flip.

## Created files

| File | Purpose |
|------|---------|
| `backend/access/engine/__init__.py` | Service package exports |
| `backend/access/engine/flags.py` | `ACCESS_ENGINE_*` flag readers |
| `backend/access/engine/access_service.py` | Grant lifecycle + audit (`AccessService`) |
| `backend/access/engine/assignment_service.py` | Individual + bulk assignment (`AssignmentService`) |
| `backend/access/engine/visibility_service.py` | Visibility authority (`VisibilityService`) |
| `backend/access/engine/classroom_service.py` | Transactional classroom access (`ClassroomAccessService`) |
| `backend/access/engine/dual_write.py` | Flag-gated signal mirroring |
| `backend/access/resources.py` | Resource-type registry (subject-vocab normalization) |
| `backend/access/migrations/0011_resourceaccessgrant_accessgrantevent_and_more.py` | Additive schema |
| `backend/access/management/commands/access_backfill.py` | Backfill legacy → grants (dry-run/undo) |
| `backend/access/management/commands/access_parity_check.py` | Legacy vs engine parity gate |
| `backend/access/tests/test_access_engine.py` | 27-test suite (all green) |
| `docs/access-redesign/01-audit-report.md` … `05-implementation-summary.md` | Audit, architecture, ERD, migration, this file |

## Modified files

| File | Change |
|------|--------|
| `backend/access/models.py` | + `ResourceAccessGrant`, `AccessGrantEvent` (additive) |
| `backend/access/admin.py` | + grant admin (revoke/extend/restore) + read-only audit |
| `backend/access/apps.py` | `ready()` connects dual-write signals (inert unless flag on) |
| `backend/config/settings.py` | + 3 `ACCESS_ENGINE_*` flags (default off) |

No existing model, column, or behavior was removed or altered. The three
permission-matrix test failures observed in the suite **pre-date this branch**
(verified at commit `0aa34a9`) and are unrelated to this work.

## Verification done locally
- `python manage.py check` — clean.
- Migration `0011` forward + `sqlmigrate` inspected; reverse drops only new tables.
- `python manage.py test access.tests.test_access_engine` — **27/27 pass**.
- `access_backfill --dry-run`, real, re-run (idempotent), `--undo` — all exercised by tests.
- `access_parity_check` — passes after backfill in tests.

## Rollback strategy (recap; full matrix in 04)
Every stage is undone by a flag flip or a reversible migration — never a restore:
- Schema: `migrate access 0010` (drops new tables; prod was inert).
- Dual-write: `ACCESS_ENGINE_DUAL_WRITE=False`.
- Backfill: `access_backfill --undo`.
- Shadow read: `ACCESS_ENGINE_SHADOW_READ=False`.
- Read cutover: `ACCESS_ENGINE_READ=False`.

## What is NOT done (next, gated on your approval)
1. **Facade routing** — wire `access.services.filter_*_for_user` / `can_view_tests`
   to delegate to `VisibilityService` when `ACCESS_ENGINE_READ` is on (per-consumer).
2. **Admin subdomain React UI** — individual/bulk/classroom assignment console on
   `admin.mastersat.uz` consuming these services.
3. **Production rollout** — deploy (flags off) → enable dual-write → backfill →
   shadow-read + parity bake → read cutover. Each step needs your go-ahead.
4. **Legacy decommission** — remove M2M read paths after sustained parity.
