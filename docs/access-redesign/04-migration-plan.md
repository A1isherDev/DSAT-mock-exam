# Phase 2 — Zero-Downtime Migration & Rollback Plan

No maintenance window. No big-bang. Every step is reversible and verifiable before the next.

## Stage 0 — Schema (additive only)
- Apply migration `access.0011` creating `resource_access_grants` + `access_grant_events`.
- **Reversible:** migration has a real `reverse` (drops the two new tables). No existing table touched, no column dropped, no data moved. Safe to deploy to prod with all flags off — pure additive DDL.
- **Verify:** `migrate access 0011` then `migrate access 0010` round-trips cleanly in staging.

## Stage 1 — Dual-write (flag `ACCESS_ENGINE_DUAL_WRITE`)
- Turn on in prod. From now on, every legacy access write (grant view, bulk-assign, classroom assignment, enroll) **also** writes a grant via the engine. Reads still 100% legacy.
- **Reversible:** flag off → mirroring stops; grant rows are inert (nothing reads them yet).
- **Verify:** create a test grant in staging, confirm a matching `ResourceAccessGrant` + `AccessGrantEvent` appear.

## Stage 2 — Backfill (`manage.py access_backfill`)
- Idempotent, batched, resumable. Converts existing `UserAccess` + all `assigned_users` M2Ms + `classes.Assignment` targets into grants (see ERD mapping). Re-running never duplicates (partial unique + `get-or-create` semantics).
- Run with `--dry-run` first (counts only), then for real, then again (should report 0 new).
- **Reversible:** `access_backfill --undo` deletes only `source`-tagged backfilled rows with a `BACKFILLED` event and no later human event.

## Stage 3 — Shadow read + parity (`ACCESS_ENGINE_SHADOW_READ` + `manage.py access_parity_check`)
- Shadow read: facade computes the new visibility result alongside legacy, logs any disagreement, **returns legacy**. Zero behavior change, real-traffic parity signal.
- `access_parity_check` samples (user × resource) pairs and asserts `legacy_can_see == VisibilityService.can_access`. Exit non-zero on any mismatch; prints offending pairs.
- **Gate:** do not proceed until parity is clean over a defined bake period.

## Stage 4 — Read cutover (`ACCESS_ENGINE_READ`, per-consumer)
- Flip read authority to the engine behind the unchanged facade, one consumer/resource type at a time.
- **Reversible:** flag off → instant return to legacy reads. No data change.

## Stage 5 — Decommission (separate later PR, not this one)
- After sustained clean parity, remove legacy M2M read paths and (optionally) columns. Out of scope here.

## Rollback matrix

| If problem at… | Action | Effect |
|----------------|--------|--------|
| Stage 0 | `migrate access 0010` | Drops new tables. Prod unaffected (was inert). |
| Stage 1 | `ACCESS_ENGINE_DUAL_WRITE=False` | Mirroring stops instantly. |
| Stage 2 | `access_backfill --undo` | Removes backfilled rows only. |
| Stage 3 | `ACCESS_ENGINE_SHADOW_READ=False` | Stops shadow compute. |
| Stage 4 | `ACCESS_ENGINE_READ=False` | Reads revert to legacy instantly. |

Every rollback is a flag flip or a reversible migration — **no restore-from-backup ever required.**

## Pre-deploy checklist (per your workflow Step "Deployment Rules")
1. `python manage.py test access --settings=config.settings_test_nomigrations` green.
2. `migrate` forward + backward round-trips in staging.
3. Dual-write verified in staging.
4. Backfill dry-run counts match expectations.
5. Parity check exits 0 in staging.
6. Rollback (flag flip) verified in staging.
7. **Human approval** before any prod flag flip.
