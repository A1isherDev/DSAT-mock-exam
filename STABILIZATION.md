# Stabilization tracking (Top 20)

Purpose: convert the ranked risk list into actionable, reproducible issues with clear ownership.

Legend:
- **Owner**: primary area (Auth/Exams/Assessments/Builder/Ops)
- **Severity**: P0 blocks students/data/grades, P1 blocks staff, P2 hidden corruption/ops debt
- **Status**: open → in_progress → done

## P0

1) **Exams: duplicated `status` action overwrites itself**
- **Owner**: Exams
- **Where**: `backend/exams/views.py` (`TestAttemptViewSet.status` defined twice)
- **Repro**:
  - Call `GET /api/exams/attempts/<id>/status/` and confirm which behavior is active (read-only vs resume+lock).
  - Observe that only the last definition is reachable.
- **Fix**:
  - Keep exactly one `status` action.
  - Make GET read-only (no state mutation) OR rename mutating action to explicit `/resume/`.
- **Test**: unit test ensures status does not mutate `version_number` and does not advance state.

2) **Exams: scoring transition bug (`enter_scoring()` unreachable)**
- **Owner**: Exams
- **Where**: `backend/exams/views.py` submit flow
- **Repro**:
  - Submit module 2 and verify timestamps/fields that should be set by `enter_scoring()` are set.
- **Fix**: correct conditional logic; add test.

3) **Assessments: autosave is last-write-wins**
- **Owner**: Assessments
- **Where**: `backend/assessments/views.py` (`SaveAnswerView`)
- **Repro**:
  - Two tabs: send older answer after newer answer; observe overwrite.
- **Fix**:
  - Add optimistic concurrency (client sequence or per-answer revision).
  - Reject stale writes with 409 and include canonical answer.
- **Test**: concurrent save ordering yields 409 on stale write.

4) **Assessments: homework repair can violate in-progress uniqueness**
- **Owner**: Assessments
- **Where**: `backend/assessments/management/commands/repair_homework_integrity.py`
- **Repro**:
  - Create duplicated homework rows for same (classroom,set), each with an in_progress attempt for same student.
  - Run repair; observe IntegrityError on unique constraint.
- **Fix**:
  - Merge attempts safely: pick canonical attempt per student, mark others abandoned, then re-point.
- **Test**: repair completes without violating constraints.

5) **Auth: UI can render as authenticated when `/users/me/` fails**
- **Owner**: Auth
- **Where**: `frontend/src/components/AuthGuard.tsx`
- **Repro**:
  - Expire access token but keep cookie present; block /me; observe UI still renders.
- **Fix**:
  - Gate on `/users/me/` when token exists; on 401 clear + redirect; on network show explicit offline state.

6) **Auth: identity cached without refresh**
- **Owner**: Auth
- **Where**: `frontend/src/lib/api.ts`, `frontend/src/lib/permissions.ts`
- **Repro**:
  - Change role/subject server-side mid-session; UI continues old behavior until relogin.
- **Fix**:
  - Single session store (React Query) refreshes identity; cookies only store tokens.

## P1

7) **Builder: TDZ crash (`questions` used before declaration)**
- **Owner**: Builder
- **Where**: `frontend/src/features/assessments/builder/BuilderSetEditorContainer.tsx`
- **Repro**: open builder set editor; observe console error “Cannot access 'questions' before initialization”.
- **Fix**: move derived `questions` above effects; adjust deps.

8) **Builder: invalidation targets missing query**
- **Owner**: Builder
- **Where**: `frontend/src/features/assessments/hooks.ts`
- **Repro**: update question; observe detail view not refetched as intended.
- **Fix**: add a real `setDetail` query backed by a real backend endpoint.

9) **Builder: editor assumes list endpoint returns full set detail**
- **Owner**: Builder
- **Where**: editor uses `useAssessmentSetsList()` only
- **Repro**: if list is limited/summary, editor shows empty questions and can send stale ids.
- **Fix**: add `GET /api/assessments/admin/sets/<id>/` and use a detail query.

10) **Auth: logout/refresh thrash on concurrent 401s**
- **Owner**: Auth
- **Fix**: global “logout in progress” latch in axios interceptor.

11) **Console drift: `lms_console` cookie host-only**
- **Owner**: Auth/Ops
- **Fix**: compute console from `window.location.hostname` client-side; avoid cookie dependence.

12) **Metrics scraping requires admin auth**
- **Owner**: Ops
- **Fix**: add Nginx basic auth or IP allowlist for metrics endpoints; optionally add an internal token.

13) **CI/deploy determinism mismatch**
- **Owner**: Ops
- **Fix**: align Python/Node versions; ensure lockfile usage.

## P2

14) **Repair command safety flags inconsistent**
- **Owner**: Ops
- **Fix**: standardize on `--dry-run` default or `--apply` required.

15) **Cache-backed counters reset on cache flush**
- **Owner**: Ops
- **Fix**: acceptable for now; document and add alerts on cache availability; long-term Prometheus client counters.

16) **No infra-level alert rules in repo**
- **Owner**: Ops
- **Fix**: add alert rules scaffolding + runbook for thresholds.

17) **Assessments backpressure best-effort**
- **Owner**: Assessments/Ops
- **Fix**: increase determinism in budgets; backoff on retries; add alerts.

18) **Multiple persistence stores for attempt drafts**
- **Owner**: Frontend
- **Fix**: consolidate/expire stale stores and validate IDs.

19) **Tokens are JS-readable cookies**
- **Owner**: Auth/Security
- **Fix**: long-term migration to HttpOnly cookies.

20) **Load/chaos methodology incomplete**
- **Owner**: Ops
- **Fix**: document how to simulate DB slow/Redis down and what invariants to assert post-test.

