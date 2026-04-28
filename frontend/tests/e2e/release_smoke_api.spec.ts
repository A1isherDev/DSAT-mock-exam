import { test, expect } from "@playwright/test";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

test.describe("release smoke (API)", () => {
  test("student: login → start exam → status", async ({ request }) => {
    const email = env("E2E_STUDENT_EMAIL");
    const password = env("E2E_STUDENT_PASSWORD");
    const practiceTestId = Number(env("E2E_PRACTICE_TEST_ID"));
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
      headers: { "Idempotency-Key": `e2e.start.${Date.now()}` },
    });
    expect(startEngine.ok()).toBeTruthy();

    const st = await request.get(`/api/exams/attempts/${attempt.id}/status/`);
    expect(st.ok()).toBeTruthy();
    const statusJson = await st.json();
    expect(statusJson?.id).toBe(attempt.id);
  });

  test("teacher: create homework + builder save", async ({ request }) => {
    const email = env("E2E_TEACHER_EMAIL");
    const password = env("E2E_TEACHER_PASSWORD");
    const classroomId = Number(env("E2E_CLASSROOM_ID"));
    test.skip(!email || !password || !Number.isFinite(classroomId) || classroomId <= 0, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    // Builder save: create set, then patch it.
    const createSet = await request.post("/api/assessments/admin/sets/", {
      data: {
        subject: "math",
        title: `E2E Smoke Set ${Date.now()}`,
        description: "Created by Playwright release smoke.",
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

    // Homework create.
    const assign = await request.post("/api/assessments/homework/assign/", {
      headers: { "Idempotency-Key": `e2e.hw.${classroomId}.${setRow.id}.${Date.now()}` },
      data: {
        classroom_id: classroomId,
        set_id: setRow.id,
        title: `E2E Homework ${Date.now()}`,
        instructions: "Smoke test assignment.",
        due_at: null,
      },
    });
    expect(assign.ok()).toBeTruthy();
    const hw = await assign.json();
    expect(hw?.id).toBeTruthy();
  });
});

