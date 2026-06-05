# Phase 2 — Architecture: Centralized Hybrid Access Engine

**Status:** Design approved (hybrid SUBJECT + RESOURCE scopes, zero-downtime dual-write).
**Principle:** One engine, introduced *behind the existing `access.services` facade*, flag-gated, prod-inert until cutover.

---

## 1. Goals

1. **One** access engine for Past Papers, Mock Exams, Midterms, Practice Tests, Assessments — and any future resource type.
2. **Hybrid scopes:** `SUBJECT` (math/english, first-class, retained) and `RESOURCE` (per resource). Visibility = subject-covers-resource **OR** direct resource grant.
3. **Lifecycle:** every grant has `source`, `status` (ACTIVE/REVOKED/EXPIRED), `expires_at`, `granted_by`, and an **immutable audit trail**.
4. **Zero-downtime migration:** dual-write → backfill → parity verify → flag-flip read → decommission. Instant rollback at every step.
5. **Extensible:** new resource types register in a table-driven registry — no schema change, no new M2M, no new visibility filter.

## 2. Core model (one grant table)

`ResourceAccessGrant` is the single source of truth. `scope` discriminates:

- **SUBJECT grant** → `subject` set (`math`/`english`), `resource_type`/`resource_id` null. Optional `classroom` to scope a subject grant to one classroom (mirrors legacy `UserAccess.classroom`).
- **RESOURCE grant** → `resource_type` + `resource_id` set, `subject` null. Optional `classroom` records the origin (classroom assignment).

`AccessGrantEvent` is an append-only audit log (GRANTED / REVOKED / EXPIRED / EXTENDED / RESTORED / BACKFILLED), never updated or deleted.

Full field list and constraints: see [03-erd.md](03-erd.md).

### Why one table, not a table per scope
A single table means one visibility query, one admin surface, one audit stream, and one extension point. The brief's `ResourceAccessGrant` shape is preserved exactly; `scope` is the only addition needed to keep SUBJECT access first-class while allowing the gradual SUBJECT→RESOURCE migration the brief asks for — without changing the public API.

## 3. Resource-type registry (`access/resources.py`)

A table mapping a stable `resource_type` key → `{model, domain-subject resolver, published predicate}`. This is the **only** place that knows about concrete resource models, and it normalizes the two subject vocabularies:

| key | model | subject vocab on model | normalized to |
|-----|-------|------------------------|---------------|
| `practice_test` | `exams.PracticeTest` | platform (`MATH`/`READING_WRITING`) | domain via `platform_subject_to_domain` |
| `mock_exam` | `exams.MockExam` | per-section platform (multi) | set of domains |
| `pastpaper_pack` | `exams.PastpaperPack` | per-section platform | set of domains |
| `practice_test_pack` | `exams.PracticeTestPack` | per-section platform | set of domains |
| `assessment_set` | `assessments.AssessmentSet` | domain (`math`/`english`) | as-is |
| `module` | `exams.Module` | via parent test | domain |

Adding a future resource type = one registry entry. No migration.

## 4. Service layer (`access/engine/`)

Business logic lives only here. Views/serializers/admin/templates call services; they never touch grant rows directly.

- **`AccessService`** — low-level grant lifecycle: `grant()`, `revoke()`, `extend()`, `expire_due()`, each writing an `AccessGrantEvent`. Idempotent (dedup on active grant), `select_for_update` on mutate.
- **`AssignmentService`** — admin-facing: `assign_subject()`, `assign_resource()`, and **bulk** variants using `bulk_create` (one query, no per-student loop — fixes the audited N+1).
- **`VisibilityService`** — the single visibility authority:
  - `can_access(user, resource_type, resource_id)` → staff RBAC (existing helpers) **OR** active resource grant **OR** active subject grant covering the resource's subject(s) (global or matching classroom), respecting `expires_at`.
  - `filter_visible(user, resource_type, queryset)` → generic queryset filter derived from the *same* logic (no SQL-vs-Python drift; replaces three bespoke filters).
- **`ClassroomAccessService`** — `assign_resource_to_classroom()` creates RESOURCE grants for all enrolled students **in one transaction** (rollback on any failure); `on_student_enrolled()` grants existing classroom assignments to a new member. Replaces the signal/backfill sync.

## 5. Visibility decision (authoritative algorithm)

```
can_access(user, rt, rid):
  if user is staff with RBAC view/edit on the resource's subject(s):  # unchanged legacy helpers
      return True
  if ACTIVE, non-expired RESOURCE grant (user, rt, rid):              # direct
      return True
  domains = registry[rt].domain_subjects(resource)                    # {} or {'math'} or {'math','english'}
  if domains and user has ACTIVE, non-expired SUBJECT grant for EVERY domain
     (classroom NULL  OR  classroom == resource's classroom context): # subject covers resource
      return True
  return False
```

Multi-subject resources (full mock) require subject coverage for *all* their subjects — preserving today's `can_assign_all_platform_subjects_in_mock` semantics.

## 6. Feature flags (`access/engine/flags.py`, env-driven like existing `LMS_AUTHZ_*`)

| Flag | Default | Effect |
|------|---------|--------|
| `ACCESS_ENGINE_DUAL_WRITE` | `False` | Legacy writes also mirror into `ResourceAccessGrant`. |
| `ACCESS_ENGINE_READ` | `False` | `VisibilityService` becomes the read authority behind the facade. |
| `ACCESS_ENGINE_SHADOW_READ` | `False` | Compute new result alongside legacy, log disagreements, **return legacy** (parity in prod, zero behavior change). |

All default **off** ⇒ production behavior is byte-identical after deploy. Rollback = set the flag back to `False` (no migration, instant).

## 7. Integration strategy (strangler fig)

1. Land models + services + admin (flag-off). No consumer changes. **Inert.**
2. Turn on `DUAL_WRITE` in prod → grants populate going forward.
3. Run `access_backfill` → historical grants. Re-runnable, idempotent.
4. Turn on `SHADOW_READ` → log parity; run `access_parity_check`. Verify zero drift over time.
5. Flip `ACCESS_ENGINE_READ` per consumer (facade routes to `VisibilityService`).
6. After bake-in, decommission legacy M2M reads. (Separate, later PR.)

The `access.services` public functions (`filter_*_for_user`, `can_view_tests`, etc.) keep their signatures; internally they route to the engine when `ACCESS_ENGINE_READ` is on. Consumers never change.

## 8. Performance

- Bulk grants via `bulk_create(..., ignore_conflicts=True)` + one audit `bulk_create`.
- Visibility filter is a single `EXISTS`/`IN` against `resource_access_grants` indexed on `(user, status, scope, resource_type, resource_id)` and `(user, status, scope, subject, classroom)`.
- Partial unique indexes guarantee no duplicate ACTIVE grant without app-level locking.
- Target 100k students × millions of grants: grant table is narrow, fully indexed, and queried by `user_id` prefix.

## 9. Out of scope for this PR (explicitly)

- Flipping any flag in production (deploy gate — your approval required).
- Admin **subdomain UI** redesign (React) — backend admin + Django admin land first; the React console is a follow-up that consumes the same services.
- Decommissioning legacy M2M columns (post-cutover PR).
