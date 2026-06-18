# Release Notes — Teacher Workspace Consolidation

Branch: `feat/teacher-workspace-consolidation`
Release commit: `a361ebf`
Production baseline (verified on host): `56f40f4`
Prepared: 2026-06-18 · **Status: prepared, NOT deployed.**

> ⚠️ **CRITICAL SCOPE NOTICE — read before deploying.** Production code is currently at the shared
> base `56f40f4`. The diff from prod → `a361ebf` is **88 commits spanning FIVE workstreams**, not a
> standalone teacher-workspace increment. Deploying this branch ships ALL of the following at once:
> (1) Access Engine, (2) Classroom Rebuild, (3) Teacher Portal Subdomain, (4) Testing-Simulation
> runner, (5) Teacher Workspace Consolidation. Several of these were previously deployed and then
> production was rolled back to `56f40f4` (reason not captured here). **Confirm this mega-release is
> intended before proceeding.** See "Production Delta Audit" below.

---

## Feature summary (delta `56f40f4` → `a361ebf`)

### 1. Admin Simplification (this workstream)
- Admin/Ops is **governance-only**. Operational classroom management (assignments, materials,
  roster, results, midterm assignment) is removed from admin and lives in the Teacher Portal.
- `/ops/assignments` → static "moved to Teacher Portal" notice.
- Admin `/ops/classrooms` rebuilt as a **governance directory** (list/search; assign-teacher,
  transfer-ownership, governance-delete only — no create/edit/assign-content).
- Student `/classes` is consumer-only (classroom creation removed).
- Ops dashboard reduced to governance/health signals; dead operational components removed
  (`components/ops/*`, `components/bulk-assign/*`).
- **Preserved authoring**: midterm/assessment/question authoring + Question Bank untouched.

### 2. Teacher Workspace (this workstream)
- Teacher Portal is the single operational workspace: classrooms (CRUD via Settings), homework,
  midterms (assign), materials (upload/download), gradebook, analytics, results.
- **Polish**: reusable `ConfirmDialog` for all destructive actions (delete material, remove/Make-TA/
  Revoke-TA student, archive class/assignment, regenerate join code, assign midterm); success/error
  toasts across mutations; fixed classroom back-link per console; spinner Suspense fallbacks.

### 3. Results system (this workstream)
- Classroom-scoped **midterm results** (`/api/classes/<pk>/midterm-results/`): assigned/started/
  completed counts + avg/high/low + per-student rows.
- **Unified results** (`/api/classes/<pk>/results/`): Assessment + Midterm + Past Paper in one view
  with student/type/date filters. Both staff-gated, read-only.

### 4. Classroom security hardening (this workstream)
- `classes.capabilities.is_global_admin` is now strictly role-based (`super_admin`/`admin`/superuser),
  no longer treating every LMS-staff teacher as a global admin. Propagates through `IsClassMemberCap`
  → all `_ClassroomScopedView` endpoints correctly deny non-members (outsider teacher → 403).

### 5. Governance (this workstream)
- Admin-only endpoints: `assign-teacher`, `transfer-ownership`, `governance-delete`, classroom
  `directory` list-all. Guarded strictly to super_admin/admin; teachers 403.

### Bundled prior workstreams (also in this delta, previously rolled back from prod)
- **Access Engine**: `ResourceAccessGrant`/`AccessGrantEvent`, engine services, write-through
  enforcement, `/ops/access` console. All `ACCESS_ENGINE_*` flags default OFF (engine inert).
- **Classroom Rebuild**: OWNER/TEACHER/TA/STUDENT roles, homework lifecycle (draft/publish/archive),
  auto-grading, gradebook, rankings (SAT + Academic), attendance.
- **Teacher Portal Subdomain**: host-routed `teacher.mastersat.uz` console + login funnel.
- **Testing-Simulation**: modern Bluebook-style exam runner (engine unchanged, wire-compatible).

---

## Migration summary

Delta migrations (`56f40f4` → `a361ebf`), all **additive / non-destructive**:

| App | Migration | Change | Applied in prod DB? |
|-----|-----------|--------|:-------------------:|
| access | `0011_resourceaccessgrant_accessgrantevent_and_more` | New grant + audit tables | ✅ already applied |
| classes | `0020_assignment_category_assignment_max_score_and_more` | Assignment lifecycle fields | ✅ already applied |
| classes | `0021_assignment_archived_at_assignment_published_at_and_more` | Publish/archive timestamps | ✅ already applied |
| classes | `0022_submissionreview_is_auto` | Auto-grade flag | ✅ already applied |
| classes | `0023_classroom_description_classroommaterial` | `Classroom.description` + `ClassroomMaterial` | ✅ already applied |

**Key fact:** these 5 migrations are **already applied in the production database** (verified via
`showmigrations` on the host). On deploy, `manage.py migrate` will record them as already-applied →
effectively a **no-op**; no schema change occurs. No destructive operations (no drops, no
data-losing renames). The production DB schema is currently *ahead* of the deployed code at
`56f40f4` (additive, non-breaking drift).

---

## Risk summary

| Risk | Severity | Notes |
|------|:--------:|-------|
| Mega-release scope (5 workstreams, 88 commits) | **HIGH** | Far larger than "teacher workspace". Requires explicit intent + per-workstream sign-off. |
| Unexplained prod rollback to `56f40f4` | **HIGH** | Why prod is on the base (vs prior feature releases) is unknown; must be understood before re-shipping. |
| Code↔DB drift | MEDIUM | DB ahead of code; additive only; migrate is no-op. Low functional risk but a state smell. |
| Access engine returns to prod | MEDIUM | Flags OFF (inert) by default; do NOT flip without separate gated approval. |
| Pre-existing lint errors (14) | LOW | Not introduced by this branch; `next build` does not run them and passes. |
| Pre-existing fresh-DB migration breakage (`questions.module_id`) | LOW | CI/fresh-build only; existing prod DB unaffected. |

---

## Rollback summary

- Release layout: `release_deploy.sh` creates timestamped `releases/<ts>-<sha>` + repoints the
  `current` symlink (atomic). `deploy/rollback.sh` repoints `current` to the prior release.
- A pre-deploy `pg_*` dump is taken automatically (shared/backups).
- **Schema rollback:** not required for this delta — migrations are already applied and additive;
  reverting code to `56f40f4` leaves the extra schema unused (the current prod condition).
- **Code rollback:** repoint `current` to the prior release dir; restart pm2 (`sat-backend`,
  `sat-frontend`, `celery`). No DB restore needed unless a later destructive migration is added.

---

## Deployment checklist (for when GO is granted)

- [ ] Confirm intent to ship all 5 bundled workstreams in one release.
- [ ] Confirm/​document why prod was on `56f40f4` and that re-shipping is desired.
- [ ] Working tree clean ✅ · branch pushed ✅ (`github-ssh`).
- [ ] Decide deploy ref (merge to `main`/`deploy/*` per the single-deploy-branch rule).
- [ ] Take fresh manual `pg_dump` immediately pre-deploy.
- [ ] `release_deploy.sh <ref>`; verify atomic symlink swap.
- [ ] `migrate` shows no pending (expected no-op for the 5 already-applied migrations).
- [ ] Health checks: homepage, login (main + teacher host), `/ops`, classroom + results APIs.
- [ ] Confirm `ACCESS_ENGINE_*` flags remain OFF.
- [ ] Smoke: teacher create→assign→student auto-access→results; admin governance actions.
- [ ] Rollback armed (`deploy/rollback.sh`); watch for 5xx.
