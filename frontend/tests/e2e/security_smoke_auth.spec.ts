import { test, expect } from "@playwright/test";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

test.describe("security smoke: cookie auth", () => {
  test("CSRF blocked without token; allowed with token", async ({ request }) => {
    const email = env("E2E_STUDENT_EMAIL");
    const password = env("E2E_STUDENT_PASSWORD");
    test.skip(!email || !password, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    // PATCH without CSRF token should be blocked (cookie auth present).
    const noCsrf = await request.patch("/api/users/me/", { data: { first_name: "CSRF" } });
    expect(noCsrf.status()).toBe(403);

    // Fetch CSRF cookie, then retry.
    const csrf = await request.get("/api/auth/csrf/");
    expect(csrf.ok()).toBeTruthy();

    const ok = await request.patch("/api/users/me/", { data: { first_name: "CSRF" } });
    expect(ok.ok()).toBeTruthy();
  });

  test("refresh token replay blocked (rotation)", async ({ request }) => {
    const email = env("E2E_STUDENT_EMAIL");
    const password = env("E2E_STUDENT_PASSWORD");
    test.skip(!email || !password, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();
    const body = await login.json();
    const refresh = String(body?.refresh || "");
    expect(refresh.length).toBeGreaterThan(20);

    // First refresh with body token should succeed (rotation creates new refresh).
    const r1 = await request.post("/api/auth/refresh/?include_tokens=1", { data: { refresh } });
    expect(r1.ok()).toBeTruthy();

    // Second refresh with the *same old* refresh should be denied (replay).
    const r2 = await request.post("/api/auth/refresh/?include_tokens=1", { data: { refresh } });
    expect(r2.status()).toBe(401);
  });

  test("revoked session denied; logout clears auth", async ({ request }) => {
    const email = env("E2E_STUDENT_EMAIL");
    const password = env("E2E_STUDENT_PASSWORD");
    test.skip(!email || !password, "Missing E2E env vars");

    const login = await request.post("/api/auth/login/?include_tokens=1", {
      data: { email, password, remember_me: 1 },
    });
    expect(login.ok()).toBeTruthy();

    // Revoke all sessions -> refresh should fail.
    const csrf = await request.get("/api/auth/csrf/");
    expect(csrf.ok()).toBeTruthy();
    const revokeAll = await request.post("/api/auth/sessions/revoke_all/", {});
    expect(revokeAll.ok()).toBeTruthy();

    const refreshAfterRevoke = await request.post("/api/auth/refresh/", {});
    expect(refreshAfterRevoke.status()).toBe(401);

    // Logout clears cookies; /me should be unauthorized.
    const logout = await request.post("/api/auth/logout/", {});
    expect(logout.ok()).toBeTruthy();

    const me = await request.get("/api/users/me/");
    expect(me.status()).toBe(401);
  });
});

