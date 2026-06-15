# MasterSAT Classroom — Target Architecture

Status: active rebuild on `feat/classroom-rebuild` (branched off `main`).
Strategy: **strangler-fig**. Build new alongside old, migrate surface-by-surface, delete legacy only after the replacement is verified. Reuse proven backend business logic; replace UI completely.

---

## 1. Guiding decisions

- **Backend models evolve additively** (migrations), they are **not** rebuilt from scratch. The submission/grading/audit/throttle machinery is hardened production code (replay certification, abuse limits, append-only audit, optimistic revision locking) and is preserved.
- **Frontend is replaced completely.** New feature module `frontend/src/features/classroom/` with its own design system. Legacy `domains/classrooms` + `components/classroom` are deleted page-by-page after each route is migrated and verified.
- **Routes are the contract.** We rebuild the existing routes (`/classes`, `/classes/[classId]`, teacher grading, ops) in place using new components, so deep links keep working. New surfaces (rankings, attendance, analytics) get new routes.
- **Roles become explicit and hardcoded nowhere.** Membership roles: `OWNER`, `TEACHER`, `TA`, `STUDENT`. Capability checks derive from role, not scattered string comparisons.
- **No classroom-size limits.** `max_students` becomes informational only; the join flow never blocks on capacity. All list endpoints paginate + filter server-side.

## 2. Model redesign (keep / extend / merge / add / remove)

| Model | Decision | Notes |
|---|---|---|
| `Classroom` | **Extend** | Flexible schedule (free-form, not just ODD/EVEN); subject gains `BOTH`; `max_students` kept but no longer enforced. |
| `ClassroomMembership` | **Rewrite roles** | `OWNER` / `TEACHER` / `TA` / `STUDENT` (adds the Teaching Assistant the spec requires; frontend already hinted `CO_TEACHER`). Data migration maps legacy `ADMIN`→`OWNER`/`TEACHER`. |
| `Assignment`, `AssignmentExtraAttachment` | **Keep** | Practice-target + scope logic is sound. |
| `Submission`, `SubmissionFile`, `SubmissionReview`, `SubmissionAuditEvent` | **Keep** | Hardened workflow (DRAFT→SUBMITTED→REVIEWED, RETURNED), revision lock, audit, dedup. Do not touch the state machine. |
| `HomeworkStagedUpload`, `StaleStorageBlob` | **Keep** | Upload staging + GC. |
| `ClassPost` + `ClassroomStreamItem` + `ClassComment` | **Merge** | Two overlapping feed models collapse into one stream + threaded comments. Migrate posts → stream items. |
| `AttendanceSession`, `AttendanceRecord` | **Add** | Per-lesson session + per-student status (PRESENT/ABSENT/LATE/EXCUSED). |
| `RankingSnapshot` | **Add** | `kind` ∈ {`ACADEMIC`,`SAT`}, per classroom + period: rank, previous_rank, score, percentile, computed_at. Enables rank-change & trend without recomputing history. |
| `AcademicWeightConfig` | **Add** | Per-classroom configurable weights (homework/assignments/quizzes/classwork/participation). |
| `Quiz` (lightweight) | **Add (phase 2)** | Teacher-authored quick quiz; feeds Academic ranking. Reuses assessment engine where possible. |

## 3. Ranking systems (two fully separate engines)

**SAT Ranking** — SAT performance only. Sources: Past Papers, Practice Tests, Mock Exams, SAT Simulations (`TestAttempt` / `AssessmentAttempt` scaled scores). Ignores homework/attendance/participation. Produces: current rank, previous rank, rank change, percentile, growth trend, historical series. Computed into `RankingSnapshot(kind=SAT)`.

**Academic Ranking** — overall standing. Sources: homework, assignments, quizzes, classwork, participation, weighted by `AcademicWeightConfig`. Produces overall academic rank. Computed into `RankingSnapshot(kind=ACADEMIC)`.

Both are computed by a service (`classes/ranking/`) on a schedule + on-demand, never inline in request paths. Read endpoints serve snapshots.

## 4. API surface (v2, additive)

Keep existing `classesApi` endpoints; add:
- `GET /api/classes/{id}/rankings/sat/` and `/rankings/academic/` — snapshot + history + my position.
- `GET/POST /api/classes/{id}/attendance/` — sessions + bulk mark.
- `GET /api/classes/{id}/analytics/` (teacher) and `/my-progress/` (student).
- Membership role management endpoints honoring `OWNER/TEACHER/TA/STUDENT`.
Permissions consolidate into capability helpers (`can_manage_class`, `can_grade`, `can_take_attendance`, `is_member`) backed by role — replacing inline `role=="ADMIN"` checks.

## 5. Frontend architecture

```
features/classroom/
  design-system/   tokens.ts (reads --ds-* CSS vars), README of rules
  ui/              Button Card Table Field Select Dialog Tabs Badge
                   EmptyState Loading Error Skeleton Stat
  shell/           ClassroomShell, ClassroomNav (role-aware)
  api/             typed client + React Query hooks
  pages/           dashboard (student+teacher), overview, assignments,
                   submissions/grading, stream, rankings, attendance, analytics
  types.ts
```
Design language: premium/minimal (Linear/Stripe/Notion), whitespace over borders, one accent, explicit empty/loading/error states. Student UI uses growth-oriented language only (no "Overdue/Failed/Weak").

## 6. Migration sequence (this is the execution order)

1. Design-system foundation + classroom shell/nav. *(additive)*
2. Student dashboard + Teacher dashboard + Classroom overview (rebuild routes in place).
3. Assignments → submissions/grading → stream/announcements (page-by-page; delete legacy component after each).
4. New systems: SAT + Academic ranking, Attendance, Analytics (+ role/migration backend work).
5. Delete legacy `domains/classrooms`, `components/classroom`, dead views, merge feed models — only once replacements are verified.

Verification per surface: backend tests green (preserve the existing security/replay matrix), workflow click-through, permission checks for each of OWNER/TEACHER/TA/STUDENT, mobile responsiveness.
