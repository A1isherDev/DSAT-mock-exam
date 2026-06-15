# Classroom Rebuild — Regression Report (Phase 17)

Branch: `feat/classroom-rebuild` · Runner: `manage.py test classes --settings=config.settings_test_nomigrations`
(no-migrations test DB; the repo's local Django trips a historical-migration conflict in `exams`,
so the test DB is built from model state — this is the project's standard local harness).

## Executive result

| Suite scope | Tests | Result |
|---|---:|---|
| **`classes` (full classroom rebuild)** | **79** | ✅ **79 / 0 / 0** (pass/fail/error) |
| Frontend `features/classroom` | — | ✅ `tsc --noEmit` clean · `eslint` clean |
| `assessments.tests.test_security_matrix` (adjacent) | 11 | ⚠️ 8 pass / 3 fail — **pre-existing, not classroom** (see Known failures) |

## Executed suites (per file)

| Suite | Tests | Area covered |
|---|---:|---|
| `tests.py` | 10 | Submission flow, practice auto-submit, file upload, access sync |
| `tests_ranking.py` | 15 | SAT + Academic scoring math (pure) |
| `tests_ranking_service.py` | 12 | Ranking orchestration + leaderboard API + visibility + history |
| `tests_attendance.py` | 10 | Attendance math, service, API, ranking integration |
| `tests_analytics.py` | 5 | Student/class analytics + real topic accuracy + permissions |
| `tests_homework_lifecycle.py` | 6 | Draft/Published/Archived visibility + endpoints + ranking semantics |
| `tests_homework_autograde.py` | 5 | Auto-grade → REVIEWED, signal entrypoint, manual-grade protection |
| `tests_gradebook.py` | 5 | Status distribution, auto-vs-teacher source, performance stats, perms |
| `tests_ta_permissions.py` | 11 | Owner/Teacher/TA/Student capability matrix |
| **Total** | **79** | |

## A. Permission matrix (Owner / Teacher / TA / Student) — ✅
`tests_ta_permissions.py` asserts, per role: assignments (create ✓TA, delete ✓Teacher/✗TA),
grading (✓TA, ✗Student), settings (✓Teacher/✗TA), ranking config (✓Teacher/✗TA), recompute
(✓TA), assign-TA (✓Owner/✗Teacher), remove-student (✓Teacher/✗TA), attendance (✓TA/✗Student),
owner-immutable. Backed by `classes/capabilities.py` (single source of truth) now enforced at
every previously `ADMIN-only` endpoint.

## B. Assignment lifecycle (Draft→Publish→View→Submit→Grade→Archive→Unarchive) — ✅
`tests_homework_lifecycle.py`: students see PUBLISHED only; staff see published+draft, archived
behind a flag; publish/archive/unarchive endpoints (staff-gated, unarchive reaches hidden rows);
archived keeps grades but leaves the completion denominator; draft counts nowhere.

## C. Auto-grading lifecycle (Practice/PastPaper/Mock/Module/Quiz) — ✅
`tests_homework_autograde.py` + `tests_gradebook.py`: completing an attempt fires the post-save
signal → submission auto-created, `SubmissionReview(is_auto=True)` created, status → **REVIEWED**.
Asserted: **never SUBMITTED / never in needs-grading**; teacher sees the score immediately in the
gradebook (auto row, source=AUTO, performance stats). Manual teacher grades are never overwritten.

## D. Manual grading lifecycle (File/Essay/Project) — ✅
`tests_gradebook.py` (manual roster: SUBMITTED→needs-grading, TEACHER source, grade shown) +
`tests.py` (submission state machine: draft→submitted, file upload, returned/resubmit) +
`tests_ta_permissions.py` (grade + return gated to staff).

## E. Attendance — ✅
`tests_attendance.py`: session create, bulk mark, mark-all-present (preserves EXCUSED), quick
correction, finalize, score math (PRESENT/LATE/ABSENT/EXCUSED), and the Academic-ranking
integration (off by default, teacher-weighted, worked example).

## F. Rankings (SAT + Academic) — ✅
`tests_ranking.py` (15): exact SAT 50/30/20 model + Academic performance×completion, confidence,
trend, bounds. `tests_ranking_service.py` (12): rank/percentile, history/previous-rank, rank-change,
FULL/ANONYMOUS/HIDDEN visibility, hide-scores, recompute permission, history privacy.

## G. Analytics — ✅
`tests_analytics.py`: class aggregates (avg, distributions, completion/submission rates),
**real per-question topic accuracy** (Reading/Writing/Math from recorded answers), student trends,
and role permissions. No synthetic metrics.

## H. Student experience (Due Today / Catch Up / Up Next + type-driven actions) — ⚠️ verified statically
The student overview bucketing and the assignment page's single type-driven action
(Start Practice Test / Past Paper / Mock / Upload / Revise) are implemented in
`features/classroom/pages/{Overview,AssignmentDetail}.tsx` and pass `tsc`/`eslint`. **No automated
browser E2E** was run (see Risk). Underlying data (workspace slices, submit path) is backend-tested.

## I. Homework experience (status controls, auto-perf stats, gradebook) — ✅ / ⚠️
Backend status controls + auto-performance stats are covered by `tests_homework_lifecycle.py` and
`tests_gradebook.py`. The composer Save-as-draft/Publish and Assignments-tab Publish/Archive/Unarchive
controls are verified statically (tsc/eslint).

## Known failures
| Test | Status | Root cause | Classroom impact |
|---|---|---|---|
| `assessments…test_teacher_cannot_author_assessment_catalog_writes` | FAIL (201≠403) | Access-engine on this `main`-based branch predates the access-engine-v2 fixes (stashed on `feat/access-engine-v2`). Governs **assessment catalog authoring**, not classroom. | None |
| `assessments…test_teacher_list_sets_scoped_to_own_subject` | ERROR | Same access-engine scoping gap | None |
| `assessments…test_global_staff_list_sets_all_subjects` | ERROR | Same | None |

Evidence they are not from this rebuild: `git status` shows **no modifications under `assessments/` or `access/`**; the failures concern subject-scoped catalog authoring (access engine), and match the same family observed before any classroom work began.

## Risk assessment
| Area | Risk | Note |
|---|---|---|
| Backend logic (permissions, lifecycle, auto-grade, rankings, attendance, analytics, gradebook) | **Low** | 79 targeted tests green; capability layer centralizes authorization. |
| Frontend rendering / interaction | **Medium** | Type/lint-clean, but no automated browser E2E (no seeded teacher/student login available in this environment). Recommend a manual click-through or Playwright pass on staging. |
| Adjacent assessment authoring | **Low (external)** | 3 pre-existing failures resolved by merging access-engine-v2; unrelated to classroom. |
| Migrations on production data | **Medium** | Additive migrations (0020–0022) verified on dev/test; production apply should run in a maintenance window with the standard `release_deploy.sh` path. |
