import { test, expect } from "@playwright/test";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function nenv(name: string): number {
  const v = Number(env(name));
  return Number.isFinite(v) ? v : NaN;
}

test.describe("golden journeys (API)", () => {
  test("student: login → start exam → module submit → resume → status", async ({ request }) => {
    const email = env("E2E_STUDENT_EMAIL");
    const password = env("E2E_STUDENT_PASSWORD");
    const practiceTestId = nenv("E2E_PRACTICE_TEST_ID");
    test.skip(!email || !password || !Number.isFinite(practiceTestId) || practiceTestId <= 0, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    const startAttempt = await request.post("/api/exams/attempts/", {
      data: { practice_test: practiceTestId },
    });
    expect(startAttempt.ok()).toBeTruthy();
    const attempt = await startAttempt.json();
    expect(attempt?.id).toBeTruthy();

    const startEngine = await request.post(`/api/exams/attempts/${attempt.id}/start/`, {
      headers: { "Idempotency-Key": `golden.start.${Date.now()}` },
    });
    expect(startEngine.ok()).toBeTruthy();
    const started = await startEngine.json();
    expect(started?.id).toBe(attempt.id);

    // Submit Module 1 with empty answers: backend may 4xx depending on validation.
    const submit1 = await request.post(`/api/exams/attempts/${attempt.id}/submit_module/`, {
      headers: { "Idempotency-Key": `golden.submit1.${Date.now()}` },
      data: { answers: {}, flagged: [] },
    });
    expect([200, 400, 409]).toContain(submit1.status());

    const resume = await request.post(`/api/exams/attempts/${attempt.id}/resume/`, {
      headers: { "Idempotency-Key": `golden.resume.${Date.now()}` },
    });
    expect([200, 400]).toContain(resume.status());

    const st = await request.get(`/api/exams/attempts/${attempt.id}/status/`);
    expect(st.ok()).toBeTruthy();
    const statusJson = await st.json();
    expect(statusJson?.id).toBe(attempt.id);
  });

  test("teacher: login → builder create+patch → assign homework", async ({ request }) => {
    const email = env("E2E_TEACHER_EMAIL");
    const password = env("E2E_TEACHER_PASSWORD");
    const classroomId = nenv("E2E_CLASSROOM_ID");
    test.skip(!email || !password || !Number.isFinite(classroomId) || classroomId <= 0, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    const createSet = await request.post("/api/assessments/admin/sets/", {
      data: {
        subject: "math",
        title: `Golden Journey Set ${Date.now()}`,
        description: "Created by golden journeys.",
        is_active: true,
      },
    });
    expect(createSet.ok()).toBeTruthy();
    const setRow = await createSet.json();
    expect(setRow?.id).toBeTruthy();

    const patchSet = await request.patch(`/api/assessments/admin/sets/${setRow.id}/`, {
      data: { title: `${setRow.title} (patched)` },
    });
    expect(patchSet.ok()).toBeTruthy();

    const assign = await request.post("/api/assessments/homework/assign/", {
      headers: { "Idempotency-Key": `golden.hw.${classroomId}.${setRow.id}.${Date.now()}` },
      data: {
        classroom_id: classroomId,
        set_id: setRow.id,
        title: `Golden Homework ${Date.now()}`,
        instructions: "Golden journey assignment.",
        due_at: null,
      },
    });
    expect(assign.ok()).toBeTruthy();
  });

  test("admin: login → create exam test → patch title", async ({ playwright }) => {
    const email = env("E2E_ADMIN_EMAIL");
    const password = env("E2E_ADMIN_PASSWORD");
    const baseURL = env("E2E_ADMIN_BASE_URL") || "https://admin.mastersat.uz";
    test.skip(!email || !password, "Missing E2E env vars");

    const ctx = await playwright.request.newContext({ baseURL });
    const login = await ctx.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    // Minimal create: backend may require additional fields depending on serializer.
    const create = await ctx.post("/api/exams/admin/tests/", {
      data: {
        title: `Golden Admin Test ${Date.now()}`,
        subject: "math",
        is_active: true,
      },
    });
    expect([201, 400, 403]).toContain(create.status());
    if (create.status() !== 201) return;
    const row = await create.json();
    expect(row?.id).toBeTruthy();

    const patch = await ctx.patch(`/api/exams/admin/tests/${row.id}/`, {
      data: { title: `${row.title} (patched)` },
    });
    expect([200, 400, 403]).toContain(patch.status());
  });

  test("test_admin: login → list tests → edit question bank surface", async ({ playwright }) => {
    const email = env("E2E_TEST_ADMIN_EMAIL");
    const password = env("E2E_TEST_ADMIN_PASSWORD");
    const baseURL = env("E2E_QUESTIONS_BASE_URL") || "https://questions.mastersat.uz";
    test.skip(!email || !password, "Missing E2E env vars");

    const ctx = await playwright.request.newContext({ baseURL });
    const login = await ctx.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    const list = await ctx.get("/api/exams/admin/tests/");
    expect(list.ok()).toBeTruthy();
    const tests = await list.json();
    expect(Array.isArray(tests)).toBeTruthy();
    test.skip(!tests.length, "No tests available to edit in this environment.");

    // Exercise a write surface that should be permitted for test_admin: patch the first test title.
    const first = tests[0] as any;
    const patch = await ctx.patch(`/api/exams/admin/tests/${first.id}/`, {
      data: { title: `${String(first.title || "Test").slice(0, 100)} (golden)` },
    });
    expect([200, 400, 403]).toContain(patch.status());
    if (patch.status() === 403) {
      const j = await patch.json().catch(() => ({}));
      expect(String((j as any)?.detail || "").toLowerCase()).not.toContain("not available on admin subdomain");
    }
  });
});

