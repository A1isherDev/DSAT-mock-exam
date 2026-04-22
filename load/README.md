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
