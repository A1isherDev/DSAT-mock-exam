# Classroom Rebuild — Legacy Cleanup Report (Phase 16)

Branch: `feat/classroom-rebuild`. Method: every candidate was dependency-traced with
repo-wide reference search **before** removal. Only files with **zero remaining references**
were deleted. Nothing was guessed.

## 1. Removed files (proven dead — zero references)

| File | Evidence | Replaced by |
|---|---|---|
| `frontend/src/components/ClassLeaderboard.tsx` | `grep ClassLeaderboard` → no importers | `features/classroom/pages/Rankings.tsx` (SAT + Academic boards) |
| `frontend/src/components/classroom/ClassGradingPanel.tsx` | `grep ClassGradingPanel` → no importers (not in the `components/classroom` barrel) | `features/classroom/pages/Gradebook.tsx` |
| `frontend/src/domains/classrooms/types.ts` | `grep domains/classrooms` → no external importers | `features/classroom/types.ts` |
| `frontend/src/domains/classrooms/api/index.ts` | same (whole `domains/classrooms/` dir unreferenced) | `features/classroom/{api,hooks,*Api}.ts` |

## 2. Removed code (dead symbols)

| Symbol | File | Reason |
|---|---|---|
| `useLeaderboard()` hook | `features/classroom/hooks.ts` | Only consumer was the deleted `ClassLeaderboard`; the rebuilt Overview no longer uses it. |
| `classroomKeys.leaderboard` | `features/classroom/queryKeys.ts` | Only used by the removed hook. |

## 3. Routes
No routes removed. The rebuild kept route URLs as the contract and replaced their
implementations in place (strangler-fig):
- `/classes` → `features/classroom/pages/ClassesHome`
- `/classes/[classId]` → `features/classroom/ClassroomWorkspace`
- `/classes/[classId]/assignments/[assignmentId]` → `features/classroom/pages/AssignmentDetail`

All three were already thin wrappers before this phase; no orphaned route files remain.

## 4. APIs
No backend endpoints were deleted (see §6 for why). One endpoint is now **frontend-orphaned**:
- `GET /api/classes/<id>/leaderboard/` (+ `classesApi.getLeaderboard`) — superseded by
  `GET /api/classes/<id>/rankings/sat|academic/`. The only caller (`ClassLeaderboard`) was
  removed. **Retained** (see §6).

## 5. Verification (post-deletion)
- `grep -rn "ClassLeaderboard|ClassGradingPanel|domains/classrooms" frontend/src` → **no references remain**.
- `tsc --noEmit` over `src/` → **no errors** introduced (the only `tsc` output is stale
  `.next/` validator artifacts for `(builder)/question-bank` and `(ops)/ops/access` pages
  that belong to the stashed access-engine-v2 branch, unrelated to this work).
- `eslint features/classroom` → clean.

## 6. Intentionally retained (with justification)

| Item | Why retained |
|---|---|
| `components/classroom/` primitives (Button, Card, Modal, Field, Tabs, Alert, EmptyState, PageHeader, Skeleton, `inputStyles`, barrel) | **Still referenced** by out-of-scope surfaces: `app/(teacher)/teacher/students/page.tsx`, `components/CreateAssignmentModal.tsx`, `components/homework/HomeworkGradingAssignmentView.tsx`. Not part of the `/classes` rebuild scope. |
| `components/CreateAssignmentModal.tsx` | **Still used** as the assignment composer by the new `features/classroom/pages/Assignments.tsx` (Save-as-draft/Publish) and by `teacher/homework` + `ops/assignments`. |
| `components/classroom/HomeworkFilePreviewTile.tsx` | Still used by `components/homework/HomeworkGradingAssignmentView.tsx`. |
| `lib/assignmentLifecycle.ts` | Used by 8 non-classroom surfaces (ops, assessments, teacher portal, dashboard). |
| `GET /classes/<id>/leaderboard/` endpoint + `classesApi.getLeaderboard` | Frontend-orphaned but **removal deferred**: removing a DRF endpoint requires proving no external/mobile/API consumer exists; backend churn is out of scope for "remove proven dead UI". Low risk to keep. Flagged for a later backend prune. |
| `posts` / `comments` endpoints + `classesApi.listPosts/createPost/listComments/createComment` | The **Stream tab is a documented ComingSoon** (Announcement/ActivityEvent merge is deferred scope, BUSINESS-ARCHITECTURE §1.1). These endpoints back that upcoming surface — retained intentionally, not dead. |
| `CreateAssignmentModal` internal `Trash2` unused import (pre-existing lint warning) | Pre-existing in legacy file; not introduced by this rebuild. Left untouched to avoid unrelated churn. |

## 7. Out-of-scope legacy NOT touched
The teacher portal (`app/(teacher)/teacher/*`), ops console (`app/(ops)/ops/*`), and
`components/homework`, `components/ops` are **separate products** from the `/classes`
student-facing workspace this rebuild targeted. They remain on the legacy primitives and
are explicitly out of scope for this cleanup. A future consolidation could migrate them onto
`features/classroom/ui`, but that is deferred (not dead code).
