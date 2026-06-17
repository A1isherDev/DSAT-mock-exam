# Teacher Portal Release — `teacher.mastersat.uz`

Branch: `feat/teacher-portal-subdomain`

## Overview

The Teacher Experience has been moved to a dedicated subdomain,
**`https://teacher.mastersat.uz`**, implemented as a **fourth host-routed console**
inside the existing single Next.js app — alongside the live `admin.` and `questions.`
consoles. It reuses the existing authentication system (shared JWT-cookie SSO across
`.mastersat.uz`); there is **no second app, no second auth system, no second user
database, and no database migration**.

The teacher pages themselves already existed under the `(teacher)` route group; this
release scopes them to the teacher host, enforces the access rule at three layers, and
adds the deployment configuration for the new subdomain.

## Access Rules

| Role | Teacher Portal |
|---|---|
| `teacher` | **Allowed** |
| `super_admin` | **Allowed** |
| `student` | Denied |
| `admin` | Denied |
| `test_admin` | Denied |
| anonymous | Denied (sent to the teacher login page) |

The rule is **role-based, fail-closed** (any unknown/legacy role is denied). This
deliberately differs from the admin console, which is permission-based — `admin` and
`test_admin` hold staff permissions but are still denied the teacher portal.

Unauthorized **authenticated** users are redirected to
`https://mastersat.uz/?denied=teacher-portal`, where a notice reads:
*"You do not have permission to access the Teacher Portal."*
**Anonymous** users are shown the teacher login page on the teacher host (a teacher can
sign in directly there).

## Architecture

```
Browser → https://teacher.mastersat.uz/*
  └─ nginx (server_name … teacher.mastersat.uz)
       ├─ /api/*  → Django/Gunicorn :8000  (SubdomainAPIGuardMiddleware: kind="teacher")
       └─ /       → Next.js :3000 (single app, host-routed)
            ├─ middleware.ts        console="teacher": only /teacher/*, "/" → /teacher
            ├─ AuthGuard            role ∈ {teacher, super_admin} else → main + denial
            └─ (teacher) route group (existing pages)
```

Three coordinated enforcement layers (defense in depth):

1. **Edge / path** — `frontend/middleware.ts` scopes the teacher host to `/teacher/*` and
   redirects `/` → `/teacher`. (Cannot check role: the JWT cookie is HttpOnly.)
2. **Client / role** — `frontend/src/components/AuthGuard.tsx` allows only
   `teacher`/`super_admin`; others are bounced cross-origin to the main site with the
   denial notice.
3. **Server / role + API** — `backend/access/host_guard.py` (`kind == "teacher"`) allows
   `/api/users/me/` for bootstrap, then gates to `teacher`/`super_admin`, then permits the
   teacher-workspace namespaces (`/api/classes/`, `/api/exams/`,
   `/api/users/admin/exam-dates/`). DRF view permissions remain authoritative on mutations.

Middleware order (`backend/config/settings.py` `MIDDLEWARE`) guarantees the user is
authenticated before the host guard reads the role:
`AuthenticationMiddleware → JWTUserMiddleware → StaffSubjectRequiredMiddleware →
SubdomainAPIGuardMiddleware`.

## Authentication (Shared SSO)

- JWT access/refresh tokens delivered as HttpOnly cookies, issued with
  `Domain=.mastersat.uz` in production → valid across every subdomain. **No change made.**
- `teacher.mastersat.uz` added to `CSRF_TRUSTED_ORIGINS`; `CSRF_COOKIE_DOMAIN`/
  `SESSION_COOKIE_DOMAIN` already `.mastersat.uz`; `SameSite=Lax`.
- API is **same-origin** per console (`/api` via nginx), so no CORS change is required.
- **Logout** clears the cookies with the shared domain → invalidates the session on every
  subdomain at once.
- **Login funnel:** `CookieTokenObtainPairView` is host-aware. On the **main** site, a
  valid teacher credential is **rejected** with a message pointing to the Teacher Portal
  (no session created). On the **teacher** host, login is restricted to
  `teacher`/`super_admin`.
  - *Accepted scope decision:* the funnel block is enforced on the **main** host only.
    Teachers can still authenticate via the `admin.`/`questions.` login pages (those
    consoles fall through). This is an explicit product decision, not a defect.

## DNS — Required Records

Add an `A` record for the teacher subdomain pointing at the same server as the apex:

```
teacher.mastersat.uz.   A   65.109.100.104
```

(A `CNAME teacher → mastersat.uz` is equivalent.) Verify before issuing the certificate:

```bash
dig +short teacher.mastersat.uz     # must return the server IP
```

## SSL — Required Certificate Steps

Per-host Let's Encrypt certs via certbot are already in use. **Expand** the existing
certificate to cover the new name (HTTP-01, no DNS API needed):

```bash
sudo certbot --nginx \
  -d mastersat.uz -d www.mastersat.uz \
  -d admin.mastersat.uz -d questions.mastersat.uz \
  -d teacher.mastersat.uz
```

This reuses the existing cert path in `deploy/nginx.conf`
(`/etc/letsencrypt/live/mastersat.uz/…`); auto-renewal then covers all names. Verify:

```bash
sudo certbot certificates                      # lists teacher.mastersat.uz
curl -sI https://teacher.mastersat.uz | head   # 200, valid chain, no warning
sudo systemctl status certbot.timer            # auto-renewal active
```

## Deployment Checklist (production)

1. **Role audit (pre-flight).** Run on the prod Postgres and reconcile any non-canonical
   roles (the `role` column has no DB-level `choices`):
   ```bash
   python manage.py shell -c "
   from django.contrib.auth import get_user_model
   from access.constants import CANONICAL_ROLES
   U = get_user_model()
   bad = list(U.objects.exclude(role__in=CANONICAL_ROLES).values_list('id','email','role'))
   print('non-canonical:', len(bad)); [print(r) for r in bad]"
   ```
2. **DNS** — create the `teacher` A record; confirm propagation with `dig`.
3. **Env** —
   - `shared/backend.env`: append `,teacher.mastersat.uz` to `ALLOWED_HOSTS`.
   - `shared/frontend.env.production`: ensure `NEXT_PUBLIC_TEACHER_PORTAL_URL` and
     `NEXT_PUBLIC_MAIN_SITE_URL` are set.
4. **Deploy code** — `bash deploy/release_deploy.sh origin/feat/teacher-portal-subdomain`
   (immutable release + `current` symlink flip; **no migrations expected**).
5. **nginx** — `server_name` already updated in `deploy/nginx.conf`; install/verify and
   reload: `sudo nginx -t && sudo systemctl reload nginx`.
6. **SSL** — run the certbot expansion command above.
7. **Verify** — `python manage.py check --deploy`; run the smoke tests below.

## Smoke Tests (expected outcomes)

Run against `https://teacher.mastersat.uz` and `https://mastersat.uz` after deploy.

| Actor | Action | Expected |
|---|---|---|
| **Anonymous** | open `teacher.mastersat.uz/` | redirected to `teacher.mastersat.uz/login` |
| **Student** | login on main | succeeds; sees student dashboard |
| **Student** | open teacher portal | bounced to `mastersat.uz/?denied=teacher-portal` + notice; teacher APIs → 403 |
| **Teacher** | login on `teacher…/login` | succeeds |
| **Teacher** | login on `mastersat.uz/login` | rejected with "sign in at the Teacher Portal" message |
| **Teacher (no subject)** | any teacher API | 403 "missing a valid subject" (`StaffSubjectRequiredMiddleware`) |
| **Teacher** | Dashboard / Grading / Analytics / Gradebook | all render with data |
| **Super Admin** | login on main | succeeds; full main/ops access |
| **Super Admin** | open teacher portal | full access |
| **Admin** | open teacher portal | bounced + denial notice; teacher APIs → 403 |
| **Test Admin** | open teacher portal | bounced + denial notice; teacher APIs → 403 |
| **Any** | logout on teacher portal | session cleared on **both** hosts |
| **Any** | HTTPS | `curl -I https://teacher.mastersat.uz` → 200, valid cert, no mixed content |

## Rollback

This release is code/config only — **no migrations, no data changes** — so rollback is
fast and safe.

**Code (release symlink):**
```bash
# Re-point to the previous release and reload (release_deploy.sh auto-reverts on
# failed health checks; this is the manual equivalent):
ln -sfn /var/www/satapp/releases/<PREVIOUS_RELEASE_ID> /var/www/satapp/current
pm2 reload all
```

**Git:**
```bash
# Discard the branch entirely (nothing merged to main yet):
git checkout main          # or the prior working branch
git branch -D feat/teacher-portal-subdomain
# If already merged, revert the merge commit:
git revert -m 1 <merge_commit_sha>
```

**Infra (optional, to fully retract the subdomain):**
```bash
# nginx: remove teacher.mastersat.uz from both server_name lines, then:
sudo nginx -t && sudo systemctl reload nginx
# DNS: remove the teacher A record (subdomain stops resolving).
# Cert: harmless to leave; reissue without -d teacher.mastersat.uz if desired.
```

Because cookies/SSO are unchanged, rollback never affects the student, admin, or questions
consoles.

## Verification status at packaging time

- Frontend lint (`npm run lint`): **0 problems in teacher-portal files.** 99 pre-existing
  problems (15 errors, 84 warnings) exist repo-wide in unrelated files
  (e.g. `features/assessments/containers/StudentAttemptRunnerContainer.tsx`) — not
  introduced by this work.
- Typecheck (`tsc --noEmit`; no `typecheck` npm script exists): **0 real errors.** The only
  output is stale generated `.next/dev/types` references to untracked question-bank pages
  (pre-existing).
- Backend (`python manage.py check`): **0 issues.**
- Migrations: `git diff main…HEAD` over migration dirs is **empty** — zero new migrations.
