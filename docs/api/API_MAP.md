## API map (backend authoritative)

This document maps **backend routes** to **frontend usage surfaces**, and annotates **subdomain availability**
as enforced by `backend/access/host_guard.py` (`SubdomainAPIGuardMiddleware`).

### Conventions
- **Surface**:
  - **public**: student/teacher portal pages on main domain
  - **admin**: staff console pages on `admin.*`
  - **questions**: staff authoring console pages on `questions.*`
- **Availability**: coarse host allow/deny (authorization still enforced in DRF views).

---

## Root URL includes (`backend/config/urls.py`)

All API routes are under `/api/*`:
- `/api/auth/*` (always allowed on all subdomains)
- `/api/users/*`
- `/api/exams/*`
- `/api/classes/*`
- `/api/access/*`
- `/api/realtime/*`
- `/api/vocabulary/*`
- `/api/assessments/*`

---

## Host guard availability (`backend/access/host_guard.py`)

### `admin.*` allowlist (coarse)
- **Allowed**:
  - `/api/users/*`
  - `/api/access/*`
  - `/api/exams/bulk_assign*`
  - `/api/exams/assignments/*`
  - `/api/exams/admin/*` (CRUD allowed; DRF permissions decide)
  - `/api/assessments/homework/assign/`
  - `/api/assessments/admin/*` (**GET only**; writes are 403)
- **Blocked**:
  - other `/api/assessments/*` (student attempt flows) → 403
  - anything else not explicitly allowed → 403

### `questions.*` allowlist (coarse)
- **Allowed**:
  - `/api/exams/admin/*`
  - `/api/assessments/admin/*` (CRUD allowed)
  - `/api/exams/bulk_assign*`
  - `/api/exams/assignments/*`
- **Blocked**:
  - `/api/users/*` → 403
- **Otherwise**: falls through (not blocked), but should be treated as unsupported unless explicitly intended.

### Main domain
- No coarse blocking for `/api/exams/admin/*` (relies on DRF permission classes).

---

## Auth (`backend/config/urls.py`)

| Method | Path | Notes | Surfaces |
|---|---|---|---|
| POST | `/api/auth/login/` | cookie JWT obtain | public/admin/questions |
| POST | `/api/auth/refresh/` | refresh cookie | public/admin/questions |
| POST | `/api/auth/logout/` | revoke cookie | public/admin/questions |
| GET | `/api/auth/csrf/` | CSRF cookie helper | public/admin/questions |
| GET | `/api/auth/sessions/` | active sessions | public/admin/questions |
| POST | `/api/auth/sessions/revoke_all/` | revoke all | public/admin/questions |
| POST | `/api/auth/sessions/<session_id>/revoke/` | revoke one | public/admin/questions |

---

## Users (`backend/users/urls.py`)

Base prefix: `/api/users/`

| Method(s) | Path | Notes | Host guard |
|---|---|---|---|
| GET | `/me/` | current user identity | admin allowed, questions blocked |
| GET/POST | `/exam-dates/` | student-facing exam date options | admin allowed, questions blocked |
| GET/POST | `/admin/exam-dates/` | staff CRUD | admin allowed, questions blocked |
| GET/PATCH/DELETE | `/admin/exam-dates/<pk>/` | staff CRUD | admin allowed, questions blocked |
| POST | `/register/` | registration | admin allowed, questions blocked |
| POST | `/google/` | google auth | admin allowed, questions blocked |
| POST | `/telegram/` | telegram auth | admin allowed, questions blocked |
| GET | `/telegram/config/` | widget config | admin allowed, questions blocked |
| POST | `/telegram/link/` | link telegram | admin allowed, questions blocked |
| GET | `/admin/security/metrics/prometheus/` | staff security metrics | admin allowed, questions blocked |
| GET | `/` | user list | admin allowed, questions blocked |
| POST | `/create/` | user create | admin allowed, questions blocked |
| PATCH | `/<pk>/update/` | user update | admin allowed, questions blocked |
| DELETE | `/<pk>/delete/` | user delete | admin allowed, questions blocked |

---

## Exams (`backend/exams/urls.py`)

Base prefix: `/api/exams/`

### Public / student routes (router)
- `PracticeTestViewSet` at `/api/exams/` (list/detail) + custom actions (e.g. `bulk_assign` action is actually at this router root)
- `MockExamViewSet` at `/api/exams/mock-exams/`
- `TestAttemptViewSet` at `/api/exams/attempts/`

### Admin routes (nested routers)
Prefix: `/api/exams/admin/`
- `/mock-exams/`
- `/pastpaper-packs/`
- `/tests/`
- `/tests/<test_pk>/modules/`
- `/tests/<test_pk>/modules/<module_pk>/questions/`

### Non-router explicit paths
- `/metrics/`
- `/metrics/prometheus/`
- `/assignments/history/`
- `/assignments/history/<pk>/`
- `/assignments/history/<pk>/rerun/`

Host guard:
- `admin.*`: allows `/api/exams/admin/*`, `/api/exams/bulk_assign*`, `/api/exams/assignments/*`
- `questions.*`: allows `/api/exams/admin/*`, `/api/exams/bulk_assign*`, `/api/exams/assignments/*`

---

## Classes (`backend/classes/urls.py`)

Base prefix: `/api/classes/`

| Method(s) | Path | Notes |
|---|---|---|
| POST | `/join/` | join classroom |
| GET/POST | `/<classroom_pk>/comments/` | classroom comments |
| * | `/submissions/…` | `SubmissionAdminViewSet` |
| * | `/<classroom_pk>/posts/…` | `ClassPostViewSet` |
| * | `/<classroom_pk>/assignments/…` | `AssignmentViewSet` |
| * | `/…` | `ClassroomViewSet` (list/detail + actions) |

---

## Assessments (`backend/assessments/urls.py`)

Base prefix: `/api/assessments/`

### Admin authoring / grading
- `GET/POST /admin/sets/`
- `GET/PATCH/DELETE /admin/sets/<pk>/`
- `POST /admin/sets/<set_pk>/questions/`
- `GET/PATCH/DELETE /admin/questions/<pk>/`
- `GET /admin/grading/metrics/`
- `GET /admin/grading/metrics/prometheus/`
- `GET /admin/homework/metrics/prometheus/`
- `POST /admin/builder/telemetry/`
- `GET /admin/attempts/<attempt_id>/`
- `POST /admin/attempts/<attempt_id>/requeue/`
- `POST /admin/attempts/<attempt_id>/force-grade/`

Host guard:
- `questions.*`: **CRUD allowed** for `/api/assessments/admin/*`
- `admin.*`: `/api/assessments/admin/*` **GET only**; writes 403 with guidance

### Teacher assign
- `POST /homework/assign/` (allowed on `admin.*`)

### Student attempt flow
- `POST /attempts/start/`
- `GET /attempts/<attempt_id>/bundle/`
- `POST /attempts/answer/`
- `POST /attempts/submit/`
- `POST /attempts/abandon/`
- `GET /homework/<assignment_id>/my-result/`

Host guard:
- `admin.*`: blocks student attempt flows under `/api/assessments/attempts/*` with 403

---

## Vocabulary (`backend/vocabulary/urls.py`)

Base prefix: `/api/vocabulary/`
- `GET /words/`
- `GET /daily/`
- `POST /review/`
- `GET/POST /admin/words/`
- `GET/PATCH/DELETE /admin/words/<pk>/`

---

## Realtime (`backend/realtime/urls.py`)

Base prefix: `/api/realtime/`
- `GET /events/` (SSE)
- `GET /metrics/`
- `GET /metrics/prometheus/`

---

## Access (`backend/access/urls.py`)

Base prefix: `/api/access/`
- `POST /grant/`

