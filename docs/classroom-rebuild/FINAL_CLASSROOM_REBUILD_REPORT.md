# MasterSAT Classroom — Final Rebuild Report

Branch: `feat/classroom-rebuild` (off `main`). Strategy: **strangler-fig** — new architecture
built alongside the old, routes migrated in place, legacy removed only after replacements were
verified. Every claim below is traceable to code (`backend/classes/`, `frontend/src/features/classroom/`),
tests (`backend/classes/tests*.py`), or the companion docs in `docs/classroom-rebuild/`.

---

## 1. Executive summary

The student-facing Classroom (`/classes`) has been rebuilt end-to-end: a new frontend feature
module with its own design system, a centralized capability/permission model, two independent
ranking systems (SAT + Academic), attendance, real-data analytics, a full homework lifecycle with
auto-grading, a teacher gradebook, and a four-tier role system (Owner/Teacher/TA/Student). Hardened
backend machinery (submission state, audit, throttles, replay) was **preserved**, not rewritten;
weak models were **extended** additively (migrations 0020–0022). **79 targeted backend tests pass**;
frontend is type- and lint-clean. Proven-dead legacy UI was removed; out-of-scope surfaces were
identified and retained with justification.

---

## 2. Architecture overview
Full detail: `docs/classroom-rebuild/BUSINESS-ARCHITECTURE.md`. Summary:

- **Domain model** — `Classroom`, `ClassroomMembership` (roles OWNER/TEACHER/TA/STUDENT + status),
  `Assignment` (+`category`, `max_score`, `status`), `Submission`/`SubmissionReview` (+`max_score`,
  `is_auto`), `AttendanceSession`/`AttendanceRecord`, `AcademicWeightConfig`, `ClassroomRankingConfig`,
  `RankingSnapshot`, `StudentGoal`. (`backend/classes/models*.py`.)
- **Capability model** — single source of truth `classes/capabilities.py`: global-admin override,
  then `ClassroomMembership.role` → capabilities. Four tiers: Owner-only · Teacher+Owner (manager) ·
  TA+Teacher+Owner (staff) · Student. No inline role-string checks remain in the action endpoints.
- **Assignment lifecycle** — `DRAFT → PUBLISHED → ARCHIVED` (+ unarchive). Students see PUBLISHED only;
  archived keeps grades but leaves the completion denominator; draft counts nowhere.
- **Submission lifecycle** — `DRAFT → SUBMITTED → REVIEWED(=Graded)`; `SUBMITTED/REVIEWED → RETURNED
  (=Needs Revision) → SUBMITTED`. State machine preserved (`submission_state.py`).
- **Attendance** — per-lesson sessions + per-student records; `attendance_score` = `100·Σweight/(counted,
  non-EXCUSED)` (PRESENT 1.0 / LATE 0.5 / ABSENT 0 / EXCUSED excluded). Feeds Academic ranking only when
  the teacher weights it (default 0). (`classes/attendance.py`.)
- **Ranking** — two independent engines (`classes/ranking/sat.py`, `academic.py`) writing `RankingSnapshot`.
  SAT = 0.50·RecentForm + 0.30·PeakAbility + 0.20·Consistency (decay, confidence, trend). Academic =
  PerformanceScore × CompletionFactor. Invariant: SAT reads only `TestAttempt`; Academic only grades/
  attendance — never crossed.
- **Analytics** — computed live from source tables + `RankingSnapshot` (`classes/analytics.py`). No cache
  table, no synthetic metrics; topic accuracy is real per-question correctness (Reading/Writing/Math only).

---

## 3. Feature inventory

| Feature | Frontend | Backend | Status |
|---|---|---|---|
| Classes home / dashboards | `pages/ClassesHome`, `pages/Overview` (role-aware) | `student-workspace`, `interventions`, `people` | ✅ |
| Classroom shell + role nav | `shell/ClassroomShell`, `shell/tabs` | capability-gated | ✅ |
| Attendance | `pages/Attendance` | `views_attendance.py` + `attendance.py` | ✅ |
| Homework (student) | `pages/AssignmentDetail` (5 questions, type-driven action) | submit/my-submission (hardened) | ✅ |
| Assignments mgmt + composer | `pages/Assignments`, `CreateAssignmentModal` (draft/publish) | `AssignmentViewSet` + lifecycle actions | ✅ |
| Gradebook | `pages/Gradebook` | `views_gradebook.py` | ✅ |
| Grading | inline in Gradebook | `grade`/`return` (capability-gated) + auto-grade | ✅ |
| Rankings (SAT + Academic) | `pages/Rankings` | `views_rankings.py` + `ranking/` | ✅ |
| Analytics | `pages/Analytics` (student + teacher) | `views_analytics.py` + `analytics.py` | ✅ |
| TA role system | `capabilities.ts`, `pages/People` controls | `capabilities.py`, `views_roster.py` | ✅ |
| Stream / announcements | `ComingSoon` placeholder | `posts`/`comments` endpoints exist | ⏸ Deferred |

---

## 4. Security model — capability matrix
Source of truth: `classes/capabilities.py` (backend) + `features/classroom/capabilities.ts` (frontend),
tested in `tests_ta_permissions.py`. `✓`=allowed, `—`=denied, `own`=own data. Admin (global) overrides all.

| Capability | Owner | Teacher | TA | Student |
|---|---|---|---|---|
| View classroom / people / stream | ✓ | ✓ | ✓ | ✓ |
| Create / edit / publish / archive assignment | ✓ | ✓ | ✓ | — |
| **Delete** assignment | ✓ | ✓ | — | — |
| Grade · return for revision | ✓ | ✓ | ✓ | — |
| Submit work / view own | — | — | — | ✓ |
| View gradebook / all submissions | ✓ | ✓ | ✓ | — |
| Take / mark / finalize attendance | ✓ | ✓ | ✓ | own (view) |
| View class analytics | ✓ | ✓ | ✓ | own |
| View rankings | ✓ | ✓ | ✓ | ✓ (per visibility) |
| **Recompute** rankings | ✓ | ✓ | ✓ | — |
| Configure ranking (weights/visibility) | ✓ | ✓ | — | — |
| Edit class settings · join code | ✓ | ✓ | — | — |
| Add / remove students | ✓ | ✓ | — | — |
| **Assign / revoke TA** | ✓ | — | — | — |
| Delete / transfer class | ✓ | — | — | — |

---

## 5. Testing summary
- **79 classroom tests, all passing** (`manage.py test classes`); breakdown in `REGRESSION_REPORT.md`.
- Coverage by area: permissions, assignment lifecycle, auto-grading, manual grading, attendance,
  rankings (math + service + API), analytics, gradebook — all have dedicated suites.
- Frontend: `tsc --noEmit` and `eslint` clean across `features/classroom`.
- **Known issues**: 3 pre-existing failures in `assessments.tests.test_security_matrix` (teacher
  catalog-authoring scope) — caused by the access-engine version on this branch, **not classroom code**
  (`assessments/`+`access/` untouched); resolved by merging `feat/access-engine-v2`.
- **Coverage gap**: no automated browser E2E (no seeded login in this environment) — frontend verified
  via type/lint + backend logic tests. Recommend a staging click-through / Playwright pass.

---

## 6. Legacy cleanup summary
Full detail + justifications: `docs/classroom-rebuild/LEGACY_CLEANUP_REPORT.md`.
- **Removed (zero references):** `components/ClassLeaderboard.tsx`, `components/classroom/ClassGradingPanel.tsx`,
  `domains/classrooms/` (types + api), dead `useLeaderboard` hook + `classroomKeys.leaderboard`.
- **Routes:** none removed (URLs kept as contract; implementations replaced in place).
- **APIs:** none removed; `GET /classes/<id>/leaderboard/` is now frontend-orphaned — retained + flagged
  (removing a DRF endpoint needs proof of no external consumer).
- **Retained with justification:** `components/classroom` primitives, `CreateAssignmentModal`,
  `HomeworkFilePreviewTile`, `lib/assignmentLifecycle` — still used by out-of-scope teacher/ops surfaces.

---

## 7. Production readiness assessment

| Area | Assessment | Notes |
|---|---|---|
| Capability / permissions | **Ready** | Centralized + matrix-tested; legacy ADMIN-only gaps fixed. |
| Assignment lifecycle + auto-grading | **Ready** | Tested incl. archived/draft ranking semantics. |
| Gradebook + grading | **Ready** | Auto vs teacher source, performance stats, needs-grading filter. |
| Attendance | **Ready** | Service + API + ranking integration tested. |
| Rankings (SAT + Academic) | **Ready** | Math + service + API + visibility tested. |
| Analytics | **Ready** | Live, real-data; topic accuracy limited to R/W/Math (no skill tags exist). |
| Student / teacher / TA UI | **Needs follow-up** | Type/lint-clean; needs a browser/E2E pass before GA. |
| Ranking/analytics scheduling | **Needs follow-up** | Recompute is on-completion + manual; the periodic daily snapshot job (Celery/cron) is not yet wired. |
| Migrations on prod | **Needs follow-up** | Additive 0020–0022; apply via `release_deploy.sh` in a window. |
| Stream / announcements | **Deferred** | ComingSoon placeholder; ClassPost/ClassroomStreamItem merge pending. |
| ADMIN→OWNER data migration | **Deferred** | Legacy `ADMIN` retained as owner-equivalent; cosmetic rename deferred. |

---

## 8. Deferred scope (intentional)
1. **Stream / announcements** rebuild + `ClassPost`+`ClassroomStreamItem`→`ActivityEvent` merge.
2. **Daily ranking/analytics snapshot job** (history currently builds on recompute events).
3. **Bulk `ADMIN`→`OWNER` data migration** (capability layer treats them as equal today).
4. **Topic analytics beyond Reading/Writing/Math** — blocked by absence of skill tags on questions.
5. **Backend prune** of the orphaned `leaderboard` endpoint (after confirming no external consumer).
6. **Teacher portal / ops console** migration onto `features/classroom/ui` (separate products).
7. **Browser/E2E automation** for the classroom flows.
8. **`Quiz` lightweight authoring model** (BUSINESS-ARCHITECTURE §1.1, phase 2).

---

## 9. Recommendations (prioritized post-release roadmap)
1. **Browser/E2E verification** on staging with seeded Owner/Teacher/TA/Student logins — close the only
   non-trivial coverage gap before GA.
2. **Merge `feat/access-engine-v2`** (or port its fixes) to clear the 3 pre-existing assessment-authoring
   failures and unify authorization.
3. **Wire the daily snapshot job** so ranking history/trends accrue even without grading activity.
4. **Plan the production migration window** for 0020–0022 (+ later ADMIN→OWNER data migration).
5. **Build the Stream** (announcements + activity feed) to retire the last ComingSoon tab.
6. **Prune the orphaned `leaderboard` endpoint** once API consumers are confirmed clear.
7. **Add skill/topic tags to questions** to deepen topic analytics beyond section level.
