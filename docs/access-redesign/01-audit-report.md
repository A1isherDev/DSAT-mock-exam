# Phase 1 — Resource Access Management Audit Report

**Date:** 2026-06-05
**Scope:** Access, permissions, assignment, classroom, and visibility logic across Past Papers, Mock Exams, Midterms, Practice Tests, and Assessments.
**Status:** Audit only — no code changed. This is the input to Phase 2 (architecture).

---

## 1. Executive summary

The platform does **not** have one access system. It has **at least six overlapping access mechanisms** that must all agree for a student to correctly see/use a resource. They frequently *don't* agree, and they are kept roughly in sync by **signals and backfill loops** rather than a single source of truth.

The brief's recommended `ResourceAccessGrant` (polymorphic, per-resource, with `source_type`, `status`, `expires_at`, audit history) **does not exist today**. What exists instead:

- A **subject-domain RBAC/ABAC engine** (`access` app) that grants `math`/`english` at *global* or *per-classroom* scope — not per resource.
- Several **per-resource `ManyToMany` "assigned_users"** tables bolted onto `exams` models.
- A **classroom homework** layer (`classes.Assignment` + `assessments.HomeworkAssignment`) that *projects* into the M2M tables via signals.

There is **no revoke, no expiry, no status, and no audit history** on any access grant. Access is effectively append-only and untraceable.

This confirms the brief's core thesis: the current system should be treated as legacy and replaced with one centralized engine.

---

## 2. The six access mechanisms (the core problem)

| # | Mechanism | Location | Granularity | Who writes it |
|---|-----------|----------|-------------|---------------|
| 1 | `access.UserAccess` | `access/models.py:8` | Subject domain (`math`/`english`), global **or** per-classroom | `GrantAccessView`, bulk-assign backfill, enroll signals |
| 2 | `PracticeTest.assigned_users` (M2M) | `exams/models.py:432` | Per practice test (past papers / practice) | bulk-assign, classroom signals |
| 3 | `MockExam.assigned_users` (M2M) | `exams/models.py:262` | Per mock exam / midterm | bulk-assign |
| 4 | `PortalMockExam.assigned_users` (M2M) | `exams/models.py:289` | Per portal mock | bulk-assign |
| 5 | `classes.Assignment` (+ FKs to mock/pack/test/module) | `classes/models.py:129` | Per classroom homework | teachers |
| 6 | `assessments.HomeworkAssignment` | `assessments/models.py:213` | Per (classroom, assessment_set) | teachers, linked to `classes.Assignment` |

**Student visibility = an ad-hoc AND/OR across #1–#6.** Example: to see a past paper on the student practice library, a student must be in `PracticeTest.assigned_users` (#2). That M2M is populated either by admin bulk-assign (#2) *or* lazily backfilled when a classroom homework targets the paper (#5 → `grant_practice_test_library_access_for_assignment`, `classes/models.py:289`) *or* when a student enrolls (`_grant_practice_library_on_student_enroll` signal, `classes/models.py:647`). Subject access (#1) is a *separate* gate layered on top for bulk eligibility.

### Why this is the central finding
A single conceptual action — "this student may use this resource" — is represented in up to six places, written by different code paths, with no shared transaction, no shared status, and no shared audit. This is the root cause of every class of bug below.

---

## 3. Findings by category

### 3.1 Database design issues
- **No `ResourceAccessGrant` / polymorphic grant table.** Per-resource access is modeled as one M2M per resource type (#2–#4) — adding a new resource type (e.g. a new "Midterm" product, "Vocabulary set") requires a new M2M + new visibility filter + new bulk-assign branch. Not extensible (violates the brief's "future resource types" requirement).
- **No lifecycle columns.** `UserAccess` and all M2Ms lack `status` (ACTIVE/REVOKED/EXPIRED), `expires_at`, `updated_at`, `source_type`, `granted_by` (M2Ms have none). Revocation is impossible without deleting rows, which destroys history.
- **No audit history.** `UserAccess` docstring is explicit: *"there is no separate historical audit table"*; `granted_by` is overwritten on each duplicate POST (`access/views.py:127`) — latest actor wins, prior actor lost.
- **Subject domain hard-coded to two values** (`math`/`english`, `access/constants.py:46`). New subjects/products require schema + constant + mapping changes in many files.
- **Dual subject vocabularies** (`MATH`/`READING_WRITING` platform vs `math`/`english` domain) converted only in `subject_mapping` — a constant source of contract bugs; `authorize()` raises `SubjectContractViolation` when callers pass the wrong one.

### 3.2 Duplicate / parallel logic
- **Three near-identical queryset filters** (`filter_practice_tests_for_user`, `filter_mock_exams_for_user`, `filter_pastpaper_packs_for_user`, `access/services.py:817–885`) that must each stay "equivalent to the ABAC helpers." The code itself ships a runtime drift detector (`debug_log_queryset_vs_can_view_tests`, `LMS_AUTHZ_CONSISTENCY_CHECKS`) — an admission that SQL visibility and Python authorization *do* drift apart.
- **Backfill loops** duplicate assignment logic: `_ensure_global_grants_for_students` (`exams/library_bulk_assign.py:24`), `grant_practice_test_library_access_for_assignment` and `..._for_user_in_classroom` (`classes/models.py:289,318`) all re-implement "make sure this student can see this."

### 3.3 Race conditions / consistency
- **Signal-driven backfill is not transactional with the action that triggers it.** Enroll signal (`classes/models.py:647`) adds M2M rows after the membership commits; a concurrent assignment create can interleave, leaving a student visible-for-some, invisible-for-others. The brief explicitly requires classroom assignment to be transactional with rollback.
- **`get_or_create` + `update(granted_by=...)`** (`access/views.py:120`) on duplicate grant POST is a read-modify-write without `select_for_update`; concurrent grants can race on `granted_by`.

### 3.4 Performance / N+1
- `_ensure_global_grants_for_students` and `_allowed_students_for_platform_subject` (`exams/library_bulk_assign.py`) call `student_has_any_subject_grant(u, dom)` **per user in a loop** → one query per student. At the brief's target (100k students, bulk assign to a whole classroom) this is a per-student query storm.
- `grant_practice_test_library_access_for_user_in_classroom` (`classes/models.py:318`) loops assignments × practice tests doing `.add(user)` individually.
- `filter_pastpaper_packs_for_user` / `filter_mock_exams_for_user` use `sections__in` / `tests__in` subqueries + `.distinct()` with documented Postgres edge cases (comments at `access/services.py:849,854`).

### 3.5 Security observations
- Authorization is correctly **server-side only** (good): docstrings repeatedly state cookies/headers are never authz inputs, and `authorize()` is the single permission entry point. This is a genuine strength to preserve.
- **Fail-open risk in visibility for students:** `visible_practice_test_platform_subjects_for_query` returns `None` (no filter → full bank) for students *before* checking per-resource assignment (`access/services.py:588`). Per-resource gating relies entirely on the `assigned_users` M2M being correct — and that M2M is the least reliable part of the system (signals/backfill). A missed backfill = silent over-exposure.
- `granted_by` overwrite (#3.1) means there is no reliable answer to "who gave this student access and when" — a compliance/audit gap.

### 3.6 Dead/legacy code & naming
- Legacy role aliases still mapped (`math_teacher`, `english_teacher`, etc., `access/services.py:70`) — pre-unification debt.
- Two semantic names for one DB permission (`PERM_EDIT_TESTS = PERM_MANAGE_TESTS`, `access/constants.py:20`).
- Empty/dead `dev.sqlite3`; multiple "consistency check" debug scaffolds suggest the team has been firefighting drift.

---

## 4. Dependency map (what depends on the access system)

Direct importers of `access.*` (production code, excluding tests):

- `exams/views.py`, `exams/library_bulk_assign.py`
- `assessments/views.py`
- `classes/views.py`, `classes/serializers.py`
- `questionbank/views.py`
- `vocabulary/views.py`
- `users/models.py`, `users/serializers.py`, `users/views.py`, `users/utils_staff.py`
- `core/authz/api.py`, `core/metrics/api.py`
- `config/*` (settings flags: `LMS_AUTHZ_*`)

**Public authorization surface that must remain stable during migration** (the "locked contract" per `access/services.py` docstring):
`authorize`, `can_view_tests`, `can_edit_tests`, `can_assign_tests`, `can_manage_questions`, `filter_*_for_user`, `has_global_subject_access`, `has_access_for_classroom`, `student_has_any_subject_grant`, plus DRF permission classes in `access/permissions.py`.

**Implication:** the new engine must be introduced *behind these function signatures* (facade), so consumers don't all change at once. This enables a strangler-fig migration.

---

## 5. What to keep vs. replace

**Keep (genuine strengths):**
- Server-side-only authorization; single `authorize()` entry point.
- RBAC role matrix (`role_permissions_matrix`) — clean and centralized.
- The facade discipline (consumers go through `access.services`).

**Replace:**
- The six fragmented per-resource access representations → one `ResourceAccessGrant`.
- Signal/backfill sync → explicit transactional service calls.
- Per-resource queryset filters → one generic visibility filter keyed on grants.
- Append-only, unauditable grants → grants with `status`, `expires_at`, `source`, immutable audit log.

---

## 6. Open architecture decisions (input needed before Phase 2)

1. **Subject-domain scope:** Today access is granted by *subject* (math/english), not per resource. Do we (a) move fully to per-resource grants and derive "subject access" from resource grants, or (b) keep subject-domain grants as a *coexisting grant type* alongside per-resource grants? This changes the data model materially.
2. **Migration risk tolerance:** Production is Postgres on a live server with real students. Do we require zero-downtime, fully-reversible, dual-write migration (slower, safer) or a maintenance-window cutover?
3. **Scope of Phase 1 delivery:** The brief lists 8 steps through deployment. Realistically this is multi-PR. Confirm we land it incrementally (new engine behind facade → migrate one resource type at a time) rather than a big-bang replacement.

---

## 7. Recommended next step

Proceed to **Phase 2 — Architecture proposal** centered on a single `ResourceAccessGrant` engine with a `VisibilityService` / `AssignmentService` / `ClassroomAccessService` layer, introduced behind the existing `access.services` facade so the ~12 consumer modules migrate incrementally and reversibly. Do **not** touch production until architecture + migration strategy are approved.
