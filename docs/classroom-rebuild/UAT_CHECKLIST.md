# Classroom Rebuild — Browser UAT Runbook

## Why a dedicated UAT env
The local `db.sqlite3` carries a **pre-existing** historical-migration drift in `exams`
(`no such column: questions.module_id` / `option_a_image`) — unrelated to the classroom
rebuild (it predates it; it's why `settings_test_nomigrations` exists). Production is unaffected
(it applies migrations incrementally on an already-consistent schema). For local/staging UAT,
build a clean DB from model state with `settings_uat`.

## Setup (verified working)
```bash
cd backend
python manage.py migrate --run-syncdb --settings=config.settings_uat   # builds uat.sqlite3 from models
python manage.py seed_classroom_uat --settings=config.settings_uat     # idempotent fixture
python manage.py runserver --settings=config.settings_uat
# frontend (separate shell)
cd frontend && npm run dev
```

**Seeded logins** (password `uatpass123`): `uat_owner@`, `uat_teacher@`, `uat_ta@`,
`uat_s1@`, `uat_s2@`, `uat_s3@` `mastersat.test`. Seeded data (verified via ORM):
1 draft / 2 published / 1 archived assignment; auto-graded practice (s1=720, s2=640);
teacher-graded essay (s2=88); needs-grading essay (s1); attendance session (P/L/A);
SAT + Academic ranking snapshots.

## Test matrix — execute each, record ✓/✗

### Owner (`uat_owner@`)
- [ ] Sees all tabs incl. Settings; can edit settings; can regenerate join code.
- [ ] People → "Make TA" / "Revoke TA" buttons present; can change a student to TA.
- [ ] Can delete an assignment; can archive/unarchive.
- [ ] Rankings → can configure visibility + recompute.

### Teacher (`uat_teacher@`)
- [ ] Gradebook: needs-grading shows s1's essay; auto rows show s1/s2 practice with Auto badge + score; performance stats (avg/high/low) visible.
- [ ] Grade s1's essay → moves to Graded (Teacher source); Return → student sees revision.
- [ ] Assignments: create (Save draft + Publish), publish a draft, archive/unarchive; **no Delete on TA** check is N/A here (teacher has delete).
- [ ] Settings editable; Rankings config editable; **People: no "Make TA"** (owner-only).
- [ ] Attendance: create session, mark, mark-all-present, finalize.

### TA (`uat_ta@`)
- [ ] Can grade, return, take attendance, create/publish/archive assignments, recompute rankings, view analytics.
- [ ] **Cannot**: delete assignment, edit settings (no Settings tab), configure ranking, Make TA, remove student.

### Student (`uat_s1@` / `uat_s2@` / `uat_s3@`)
- [ ] Overview answers "what next": Due today / Catch up / Up next; no charts.
- [ ] Assignment page (5 questions) → single action: essay = **Upload Submission**; practice = **Start Practice Test**; returned = **Revise and Resubmit**.
- [ ] Sees own SAT + Academic standing; rankings respect visibility mode.
- [ ] Sees own attendance %; personal analytics; **no** Gradebook/Settings/grading.
- [ ] Draft + archived assignments are **not** visible.

### Cross-cutting
- [ ] Auto-graded work never appears in "Needs grading".
- [ ] Visibility modes FULL/ANONYMOUS/HIDDEN behave per role (set as teacher, view as student).
- [ ] Mobile width (resize) — layouts remain usable.

## Status
Backend pipeline verified end-to-end on the clean UAT DB (data integrity confirmed via ORM).
Interactive browser click-through to be executed on this env or staging using the matrix above.
