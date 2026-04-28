# Load testing (SAT exam engine)

This folder contains **minimal harnesses** to load test the SAT exam engine.

## k6

File: `load/k6_sat_exam_engine.js`

Example:

```bash
k6 run \
  -e BASE_URL="https://yourhost" \
  -e TOKEN="YOUR_JWT" \
  -e PRACTICE_TEST_ID="123" \
  -e VUS="500" \
  -e DURATION="120s" \
  load/k6_sat_exam_engine.js
```

## What to measure

- Attempt create/resume latency\n+- Module submit latency\n+- SCORING time to completion\n+- Error rate (409 version conflicts, 400 invalid transitions)\n+- Backend CPU/DB load, queue depth, worker throughput\n+
## Chaos methodology (infra fault injection)

This repo intentionally keeps chaos tools simple. Use infrastructure controls to inject faults while running k6 scripts.

### DB slow
- Temporarily add latency at the DB layer (e.g. `tc qdisc` on the DB host, or a managed service latency injection tool).
- Expected invariants:
  - no duplicate active attempts created (`audit_exam_integrity` stays clean)
  - requests may be slower, but should not 500 in bulk

### Redis down
- Stop Redis (or block connectivity) while running.\n+- Expected invariants:\n+  - exams/assessments still function (core flows use DB locks/constraints)\n+  - counters/alerts may degrade (cache-backed counters), but **data integrity** stays intact\n+
### Concurrency storms\n+- Run `load/k6_chaos_exam_engine.js` with high `VUS`.\n+- Expected invariants:\n+  - `exams_active_attempt_duplicates_prevented_total` increases, but DB shows one active attempt per (student,test)\n+  - duplicate submits do not corrupt state\n+
## Performance profile (high throughput)

File: `load/k6_sat_exam_engine_perf.js`

Targets:
- ~1000 exam starts (tune `STARTS_RATE * STARTS_DURATION`)
- ~500 submits (tune `SUBMITS_RATE * SUBMITS_DURATION`)

Example:

```bash
k6 run \
  -e BASE_URL="https://yourhost" \
  -e TOKEN="YOUR_JWT" \
  -e PRACTICE_TEST_ID="123" \
  -e STARTS_RATE="50" -e STARTS_DURATION="20s" \
  -e SUBMITS_RATE="25" -e SUBMITS_DURATION="20s" \
  load/k6_sat_exam_engine_perf.js
```

