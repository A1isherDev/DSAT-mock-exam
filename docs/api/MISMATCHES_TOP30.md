## Top mismatches (by severity)

This list is the **highest-impact contract drift** identified by diffing backend route/surface rules
(`docs/api/API_MAP.md`) against current frontend call patterns (`docs/api/FRONTEND_CALLERS.md`).

### Legend
- **P0**: blocks critical user/staff workflows or causes silent wrong UI state
- **P1**: causes frequent 403/404/empty lists or cross-surface drift
- **P2**: typing/response-shape drift likely to become P0/P1

---

## P0 (blocking / silent-wrong-state)

1. **Admin build tries to write to assessments authoring endpoints on `admin.*` (host-guard 403).**
   - **Backend rule**: `admin.*` allows `GET /api/assessments/admin/*` only; writes are blocked with 403 guidance.
   - **Frontend**: `frontend/src/app/admin/page.tsx` exposes create/update flows via `assessmentsAdminApi.*` (e.g. `POST /assessments/admin/sets/`).
   - **Impact**: staff sees broken “create/edit set/question” in admin console if that page is deployed on `admin.*`.

2. **Assessments feature API mixes surfaces (admin + teacher + student) in one module, enabling wrong-subdomain calls.**
   - **Frontend**: `frontend/src/features/assessments/api.ts`
     - authoring: `/assessments/admin/*`
     - teacher assign: `/assessments/homework/assign/`
     - student attempts: `/assessments/attempts/*`
   - **Impact**: a bundle import in the wrong UI surface can call endpoints that are host-blocked (e.g. student attempt calls from `admin.*` → 403) and look like “empty state” if errors are swallowed.

3. **Bulk-assign components import low-level clients directly (no feature boundary), enabling route drift.**
   - **Frontend**: `frontend/src/components/bulk-assign/BulkAssignWizard.tsx`, `frontend/src/components/bulk-assign/AssessmentClassroomAssignPanel.tsx`
   - **Impact**: bulk assign is operationally critical; direct low-level usage increases likelihood of wrong endpoint/method drift without centralized fixes.

---

## P1 (frequent 403/404/empty lists; surface drift)

4. **Missing `assessmentsStudentApi` / `assessmentsTeacherApi` as a first-class client.**
   - **Requirement**: explicit separation (`assessmentsStudentApi` vs `assessmentsAdminApi`).
   - **Current**: student attempt calls are “inline axios” in `features/assessments/api.ts`.
   - **Impact**: inconsistent error handling, inconsistent typing, harder lint boundary enforcement.

5. **Teacher routes are not protected by staff-surface lint rules.**
   - **Frontend**: `frontend/src/app/(teacher)/**` imports low-level clients directly (e.g. `teacher/students` imports both `examsPublicApi` and `examsAdminApi`).
   - **Impact**: accidental admin/public cross-calls or wrong-subdomain usage.

6. **Assessment authoring list responses assume arrays; backend may paginate (`results`).**
   - **Frontend**: `assessmentAuthoringApi.listSets()` treats `assessmentsAdminApi.adminListSets()` as array.
   - **Backend**: some DRF list endpoints can return paginated `{"results":[...]}`.
   - **Impact**: silent empty lists (200 OK) if pagination is introduced/turned on.

7. **`assessmentAttemptApi.bundle()` returns `any` for `set` and `questions`.**
   - **Frontend**: `frontend/src/features/assessments/api.ts`
   - **Impact**: response-shape drift becomes runtime failures (e.g. expecting fields that moved/renamed).

8. **`examsFeatureApi` exports `examsHttp` (typed as variadic `any[]`) as an escape hatch.**
   - **Frontend**: `frontend/src/features/exams/api.ts`
   - **Impact**: allows direct raw axios calls without contract enforcement; bypasses future zod/OpenAPI guards.

9. **Admin/authoring pages still import `authApi`/`usersApi` directly from low-level client.**
   - **Frontend**: `frontend/src/app/admin/page.tsx`
   - **Impact**: makes it harder to fully enforce “pages import only feature APIs”.

10. **Subdomain expectations are not encoded into clients.**
   - **Backend**: `host_guard.py` enforces coarse availability.
   - **Frontend**: clients do not check `window.location.host` to prevent calling unsupported endpoints (they rely on 403 responses).
   - **Impact**: repeated forbidden calls, noisy telemetry, and user confusion.

---

## P2 (contract hygiene + future drift prevention)

11. **Widespread `any`/`unknown` payloads in low-level API clients and pages.**
   - **Frontend**: `frontend/src/lib/api.ts` has multiple `data: object` / `Record<string, unknown>` payloads with no schema.
   - **Impact**: payload field drift (`title` vs `name`, etc.) will compile and fail only at runtime.

12. **No single “error envelope” type in frontend.**
   - **Backend**: standard DRF `{"detail": ...}` plus new core `AppError` envelope support.
   - **Frontend**: ad-hoc `e?.response?.data?.detail` reads; some pages swallow errors.
   - **Impact**: silent empty states, inconsistent UX, missed “wrong endpoint” guidance.

13. **No contract tests verifying list/detail shapes per endpoint.**
   - **Impact**: subtle response changes break UI without immediate test failures.

14. **No automated endpoint map diff in CI.**
   - **Impact**: new backend routes or renamed endpoints can ship without updating frontend.

15. **Assessments homework assign duplicates logic (`assessmentsAdminApi.assignHomework` vs feature direct axios).**
   - **Frontend**: `frontend/src/features/assessments/api.ts` uses raw axios POST.
   - **Impact**: idempotency headers and error handling can diverge.

16. **Teacher flows use public library endpoints for operational lists without explicit guardrails.**
   - **Frontend**: `teacher/students` uses `/api/exams/` list to choose tests.
   - **Impact**: if backend adds staff-only filtering or changes list behavior, teacher flow can silently change.

---

## Next actions (maps to plan todos)
- Fix P0/P1 items first in **`fix-blockers`** by:\n+  - splitting assessments feature API into `assessmentsStudentApi` and `assessmentsAdminApi` feature wrappers\n+  - moving/guarding assessment authoring UI so it runs only on `questions.*` (or explicitly shows “use questions console”)\n+  - enforcing feature-boundary imports for teacher + bulk-assign.\n+
