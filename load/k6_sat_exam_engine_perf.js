import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    starts: {
      executor: "constant-arrival-rate",
      rate: __ENV.STARTS_RATE ? Number(__ENV.STARTS_RATE) : 50,
      timeUnit: "1s",
      duration: __ENV.STARTS_DURATION || "20s",
      preAllocatedVUs: __ENV.PREALLOCATED_VUS ? Number(__ENV.PREALLOCATED_VUS) : 200,
      maxVUs: __ENV.MAX_VUS ? Number(__ENV.MAX_VUS) : 1000,
      exec: "startAttempt",
    },
    submits: {
      executor: "constant-arrival-rate",
      rate: __ENV.SUBMITS_RATE ? Number(__ENV.SUBMITS_RATE) : 25,
      timeUnit: "1s",
      duration: __ENV.SUBMITS_DURATION || "20s",
      preAllocatedVUs: __ENV.PREALLOCATED_VUS ? Number(__ENV.PREALLOCATED_VUS) : 200,
      maxVUs: __ENV.MAX_VUS ? Number(__ENV.MAX_VUS) : 1000,
      exec: "submitModule",
      startTime: "5s"
    },
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const TOKEN = __ENV.TOKEN || "";
const PRACTICE_TEST_ID = __ENV.PRACTICE_TEST_ID ? Number(__ENV.PRACTICE_TEST_ID) : null;

function apiHeaders(extra) {
  const h = { "Content-Type": "application/json" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return { headers: { ...h, ...(extra || {}) } };
}

export function startAttempt() {
  if (!PRACTICE_TEST_ID) return;
  const r0 = http.post(
    `${BASE_URL}/api/exams/attempts/`,
    JSON.stringify({ practice_test: PRACTICE_TEST_ID }),
    apiHeaders(),
  );
  check(r0, { "attempt create ok": (r) => r.status === 201 || r.status === 200 });
}

export function submitModule() {
  if (!PRACTICE_TEST_ID) return;
  const r0 = http.post(
    `${BASE_URL}/api/exams/attempts/`,
    JSON.stringify({ practice_test: PRACTICE_TEST_ID }),
    apiHeaders(),
  );
  if (!(r0.status === 201 || r0.status === 200)) return;
  const attempt = r0.json();
  const attemptId = attempt.id;
  const r1 = http.post(
    `${BASE_URL}/api/exams/attempts/${attemptId}/submit_module/`,
    JSON.stringify({ answers: {}, flagged: [] }),
    apiHeaders({ "Idempotency-Key": `${attemptId}-m1-${__ITER}` }),
  );
  check(r1, { "submit ok": (r) => r.status === 200 });
  sleep(0.05);
}

