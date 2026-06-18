# Production Deploy Audit — feat/teacher-workspace-consolidation

Date: 2026-06-18
Commit: `a361ebf` (`feat/teacher-workspace-consolidation`)
**Verdict: NO-GO — stopped at Phase 0/Phase 1 gates. No deployment performed. No prod host accessed.**

## Phase 0 — Pre-Deploy Audit

| Gate | Status | Evidence |
|------|:------:|----------|
| Branch up to date | ❌ FAIL | No upstream set; branch never pushed to `origin`/`github-ssh`. "Up to date vs remote" cannot be asserted. Deploy flow uses a remote ref (`release_deploy.sh origin/<ref>`); this ref does not exist remotely. |
| Working tree clean | ❌ FAIL | `frontend/src/app/globals.css` modified (pre-existing) + 7 untracked paths (`.claude/`, `graphify-out/`, `pitch/`, `scripts/build_pitch_*.py`, `backend/questionbank/`, `test-results/`). |
| Build passes | ✅ PASS | `next build` exit 0 on `a361ebf` (all routes compiled). |
| Typecheck passes | ✅ PASS | `tsc --noEmit` exit 0. NOTE: `npm run typecheck` **does not exist** (scripts are only `build` + `lint`); the requested command cannot run as written. |
| Lint passes | ❌ FAIL | `npm run lint` (full repo) → **14 errors, 77 warnings**. All 14 errors are in **pre-existing files not touched by this work** (`(builder)/.../[moduleId]/page.tsx` × an assign-to-`module` rule, `(main)/pastpapers/*` restricted-import + `<a>`→`<Link>` + "refs during render"). My changed files lint clean. |
| Backend checks pass | ✅ PASS | `manage.py check` — 0 issues. |
| Migrations valid / no conflicts | ✅ PASS (local) | One linear leaf per app; `classes` at `0023`, `access` at `0011`. ⚠ Pre-existing fresh-DB breakage (`questions.module_id`) blocks clean CI/fresh builds (documented; not on existing DBs). |
| No unapplied migrations | ⚠ MIXED | Local dev DB: **none unapplied.** Production: this branch introduces **`classes 0023` (Classroom.description + ClassroomMaterial, additive/non-destructive)** which prod does **not** yet have → a real `migrate` would run on deploy. |
| Release notes available | ❌ FAIL | None prepared. |

### Phase 0 facts
- Commit: `a361ebf3b846079fa56af88e1bc4857e2807008b`
- Branch: `feat/teacher-workspace-consolidation` (85 commits ahead of stale local `main` `2e569c4`).
- Containment: HEAD **contains** all of `deploy/access-engine` (`4cea50b`) and `github-ssh/main` (`28390503`) — so it does not *drop* known deployed work (the prior clobber-regression pattern). However local deploy refs are **not fetched** and are likely behind true prod (memory: prod advanced to teacher-portal release `4a98909`); actual prod HEAD/migration state is **unverified** without accessing the prod host.
- Migration summary: additive only this branch (`classes 0023`). No destructive operations (no drops/renames-with-loss).
- Risk summary: MEDIUM-HIGH to attempt now — dirty tree, unpushed branch, full-repo lint failing, true prod state unverified, and Phase-1 staging validation not executable.

## Phase 1 — Staging Validation

| Gate | Status | Reason |
|------|:------:|--------|
| Deploy to staging first | ❌ BLOCKED | No staging **web** environment exists. The only described server is **production** (`65.109.100.104`). (A staging *DB* clone `mastersat_e2e` exists for E2E, but no staging app deploy target.) |
| Authed teacher/student/admin workflow click-through + screenshots + validation matrix | ❌ UNVERIFIABLE LOCALLY | Documented constraint: local single Next dev proxy binds **one** backend Host, and consoles are auth+role gated; faithful cross-console authed browser E2E (and its screenshots) is not reproducible locally. Producing it would require running against live prod — inverting the mandated staging-before-prod order. |

Because Phase 1 cannot be completed with real evidence, the Phase 2 GO/NO-GO gate cannot be reached with evidence. Per the controlling instruction ("if any deployment gate fails, stop immediately and report"), execution halts here.

## What is NOT blocking (already verified earlier)
Code quality of the change itself is green: `tsc` clean, changed-file lint clean, `next build` pass, `vitest` 227/227, `manage.py check` 0 issues, governance/ownership/access-automation code paths intact (no backend changes this cycle).

## Remediation path to a real GO
1. Commit/stash `globals.css`; confirm intended working-tree state.
2. Push `feat/teacher-workspace-consolidation` to a remote and decide the deploy ref (merge to `main` or a `deploy/*` branch per the established "deploy from one branch" rule).
3. Prepare release notes.
4. Fix or formally waive the 14 pre-existing full-repo lint errors (they predate this work; build tolerates them, but `npm run lint` is a stated gate).
5. Stand up a real staging deploy, OR get explicit sign-off to validate on prod post-deploy (changes the risk model and the mandated order).
6. On the prod host: confirm current release commit + migration state, take pre-deploy DB backup, then `release_deploy.sh <pushed-ref>` with health checks + rollback armed.
7. Address (or accept) the fresh-DB `questions.module_id` migration breakage for clean CI.

## Rollback procedure (reference, for when a deploy does run)
Release layout uses a `current` symlink (`release_deploy.sh`; `deploy/rollback.sh`). Pre-deploy
`pg_*` dump is taken automatically. Rollback = repoint `current` to prior release + restore the
pre-deploy dump if the additive `classes 0023` must be reversed (additive, so usually no data
restore needed). No destructive migration in this delta.
