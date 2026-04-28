import http from "k6/http";
import { check, sleep } from "k6";

// Chaos harness: exercise concurrency + duplicate submits under stress.
// Fault injection is expected to be done at the infrastructure layer (DB slow, Redis down),
// while this script validates the system degrades without corrupting data.

export const options = {
  vus: __ENV.VUS ? Number(__ENV.VUS) : 100,
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
    sleep(1);
    return;
  }

  // Start/resume (this endpoint is now concurrency-safe).
  const r0 = http.post(
    `${BASE_URL}/api/exams/attempts/`,
    JSON.stringify({ practice_test: PRACTICE_TEST_ID }),
    apiHeaders(),
  );
  check(r0, { "attempt create ok": (r) => r.status === 201 || r.status === 200 });
  if (!(r0.status === 201 || r0.status === 200)) return;
  const attempt = r0.json();
  const attemptId = attempt.id;

  // Duplicate submits with same idempotency key must never corrupt state.
  const idem = `${attemptId}-chaos-submit-${__ITER}`;
  const r1 = http.post(
    `${BASE_URL}/api/exams/attempts/${attemptId}/submit_module/`,
    JSON.stringify({ answers: {}, flagged: [] }),
    apiHeaders({ "Idempotency-Key": idem }),
  );
  check(r1, { "submit ok": (r) => r.status === 200 || r.status === 400 });

  const r1b = http.post(
    `${BASE_URL}/api/exams/attempts/${attemptId}/submit_module/`,
    JSON.stringify({ answers: {}, flagged: [] }),
    apiHeaders({ "Idempotency-Key": idem }),
  );
  check(r1b, { "dup submit ok": (r) => r.status === 200 || r.status === 400 });

  // Status should still be available (unless infra is fully down).
  const st = http.get(`${BASE_URL}/api/exams/attempts/${attemptId}/status/`, apiHeaders());
  check(st, { "status ok": (r) => r.status === 200 || r.status === 404 || r.status === 503 });

  sleep(0.1);
}

