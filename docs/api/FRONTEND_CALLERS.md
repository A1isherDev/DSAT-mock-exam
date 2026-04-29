## Frontend callers inventory

This is a **callsite index**: which UI files import low-level API clients and/or call `/api/*` paths.
It is used to diff against `docs/api/API_MAP.md`.

### Canonical low-level clients
- `frontend/src/lib/api.ts`
  - Exposes: `authApi`, `usersApi`, `classesApi`, `examsPublicApi`, `examsAdminApi`, `assessmentsAdminApi`, `vocabularyApi`
  - Direct axios calls: `api.get/post/patch/delete` are used inside the client definitions.

### Feature API surfaces (preferred import boundary)
- `frontend/src/features/exams/api.ts` → wraps `examsPublicApi` (exam runner + public catalog)
- `frontend/src/features/adminExams/api.ts` → alias of `examsAdminApi` (staff exams)
- `frontend/src/features/adminAssessments/api.ts` → alias of `assessmentsAdminApi` (staff assessments)
- `frontend/src/features/assessments/api.ts` → mixed surface:
  - authoring: uses `assessmentsAdminApi` + direct `api.post("/assessments/admin/builder/telemetry/")`
  - homework assign: direct `api.post("/assessments/homework/assign/")`
  - student attempts: direct `api.post/get("/assessments/attempts/*")`

---

## Direct `@/lib/api` importers (highest drift risk)

### Admin console
- `frontend/src/app/admin/page.tsx`
  - Uses feature APIs for exams/assessments authoring: `@/features/adminExams/api`, `@/features/adminAssessments/api`
  - Still imports `authApi`, `usersApi` from `@/lib/api`

### Teacher area (not currently covered by admin lint boundaries)
- `frontend/src/app/(teacher)/teacher/students/page.tsx`
  - imports: `examsAdminApi`, `classesApi`, `examsPublicApi`
  - flows: list classes, list class people, list practice tests (public), bulk-assign via admin API
- `frontend/src/app/(teacher)/teacher/homework/page.tsx`
  - imports: `classesApi` (class list + assignments)
- `frontend/src/app/(teacher)/teacher/page.tsx`
  - imports: `classesApi` (teacher dashboard)

### Bulk assign components
- `frontend/src/components/bulk-assign/BulkAssignWizard.tsx`
  - imports: `examsAdminApi`, `assessmentsAdminApi`, `classesApi`
- `frontend/src/components/bulk-assign/AssessmentClassroomAssignPanel.tsx`
  - imports: `assessmentsAdminApi`, `classesApi`

### Student exam flows
- `frontend/src/app/exam/[attemptId]/page.tsx`
  - imports: `examsPublicApi` (runner endpoints)
- `frontend/src/app/review/[attemptId]/page.tsx`
  - imports: `examsPublicApi` (review endpoints)
- `frontend/src/app/(main)/practice-test/[id]/page.tsx`
  - imports: `examsPublicApi`
- `frontend/src/app/mock/[id]/page.tsx`, `/break/page.tsx`, `/results/page.tsx`
  - imports: `examsPublicApi`
- `frontend/src/components/PracticeTestsList.tsx`, `frontend/src/components/MockExamsList.tsx`
  - imports: `examsPublicApi`
- `frontend/src/components/dashboard/HomeDashboard.tsx`
  - imports: `examsPublicApi`

### Classes / profile / misc student pages
- `frontend/src/app/(main)/classes/page.tsx`
  - imports: `classesApi`
- `frontend/src/app/(main)/classes/[classId]/page.tsx`
  - imports: `classesApi`
- `frontend/src/app/(main)/classes/[classId]/assignments/[assignmentId]/page.tsx`
  - imports: `classesApi`, (and may import exam/admin APIs depending on assignment type)
- `frontend/src/app/(main)/profile/page.tsx`
  - imports: `usersApi`
- `frontend/src/app/(main)/security/page.tsx`
  - imports: `usersApi`/`authApi` (security step-up / sessions)
- `frontend/src/app/(main)/vocabulary/daily/page.tsx`, `frontend/src/app/(main)/vocabulary/words/page.tsx`
  - imports: `vocabularyApi`

### Auth shell pages
- `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx`, `frontend/src/app/frozen/page.tsx`
  - imports: `authApi` / `usersApi` (and shared auth helpers)

---

## Direct axios `api.*` usage outside `lib/api.ts`
- `frontend/src/features/assessments/api.ts`
  - `/assessments/admin/builder/telemetry/` (POST)
  - `/assessments/homework/assign/` (POST)
  - `/assessments/attempts/*` (student attempt flow)

---

## Known drift hotspots (priority review targets)
1. Teacher area (`src/app/(teacher)/**`) mixing public + admin surfaces.
2. Bulk-assign components (`src/components/bulk-assign/**`) using low-level APIs directly.
3. Assessments feature API (`src/features/assessments/api.ts`) uses `any` and direct axios calls (contract drift risk).
4. Places expecting list responses to be arrays without handling DRF pagination `{ results: [...] }` (use `unwrapAdminList` patterns consistently).

