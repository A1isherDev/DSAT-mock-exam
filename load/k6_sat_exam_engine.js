import http from "k6/http";
import { check, sleep } from "k6";

// Minimal k6 harness (placeholder): requires a real base URL + auth token.
// Run example:
//   k6 run -e BASE_URL="https://yourhost" -e TOKEN="..." load/k6_sat_exam_engine.js

export const options = {
  vus: __ENV.VUS ? Number(__ENV.VUS) : 50,
  duration: __ENV.DURATION || "60s",
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const TOKEN = __ENV.TOKEN || "";
const PRACTICE_TEST_ID = __ENV.PRACTICE_TEST_ID ? Number(__ENV.PRACTICE_TEST_ID) : null;

function apiHeaders(extra) {
  const h = { "Content-Type": "application/json" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return { headers: { ...h, ...(extra || {}) } };
}

export default function () {
  if (!PRACTICE_TEST_ID) {
    // No-op run; provide PRACTICE_TEST_ID to actually execute.
    sleep(1);
    return;
  }

  // 1) Create/resume attempt
  const r0 = http.post(
    `${BASE_URL}/api/exams/attempts/`,
    JSON.stringify({ practice_test: PRACTICE_TEST_ID }),
    apiHeaders(),
  );
  check(r0, { "attempt create ok": (r) => r.status === 201 || r.status === 200 });
  const attempt = r0.json();
  const attemptId = attempt.id;

  // 1b) Autosave flood (light)
  for (let i = 0; i < 3; i++) {
    const s = http.post(
      `${BASE_URL}/api/exams/attempts/${attemptId}/save_attempt/`,
      JSON.stringify({ answers: { "1": "A" }, flagged: [] }),
      apiHeaders({
        "Idempotency-Key": `${attemptId}-save-${__ITER}-${i}`,
        "If-Match": String(attempt.version_number || 0),
      }),
    );
    check(s, { "autosave ok": (r) => r.status === 200 || r.status === 409 });
    sleep(0.1);
  }

  // 2) Submit module (depends on module already active in your environment)
  const r1 = http.post(
    `${BASE_URL}/api/exams/attempts/${attemptId}/submit_module/`,
    JSON.stringify({ answers: {}, flagged: [] }),
    apiHeaders({ "Idempotency-Key": `${attemptId}-m1-${__ITER}` }),
  );
  check(r1, { "submit module ok": (r) => r.status === 200 });

  // 2b) Duplicate submit (same idempotency key) should be safe
  const r1b = http.post(
    `${BASE_URL}/api/exams/attempts/${attemptId}/submit_module/`,
    JSON.stringify({ answers: {}, flagged: [] }),
    apiHeaders({ "Idempotency-Key": `${attemptId}-m1-${__ITER}` }),
  );
  check(r1b, { "dup submit ok": (r) => r.status === 200 });

  // 3) Poll status (simulate scoring wait)
  for (let i = 0; i < 5; i++) {
    const s = http.get(`${BASE_URL}/api/exams/attempts/${attemptId}/status/`, apiHeaders());
    check(s, { "status ok": (r) => r.status === 200 });
    sleep(0.4);
  }
}

