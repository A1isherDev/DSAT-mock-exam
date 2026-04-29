## API stability score (before/after)

This repo tracks a lightweight “API stability score” to measure progress toward:
**one contract, one truth, zero drift**.

### How to compute

Run:

```bash
python scripts/api_stability_score.py
```

### Metrics (current)
The score is a weighted sum of:
- **openapi_enabled**: OpenAPI schema generation is present and succeeds (`/api/schema/` or `manage.py spectacular`).
- **openapi_types_present**: `frontend/src/lib/openapi-types.ts` exists (generated from `backend/openapi.yaml`).
- **lint_boundaries_present**: eslint contains restricted-import guardrails for `admin/**`, `bulk-assign/**`, and `teacher/**`.
- **backend_host_guard_contract_tests**: host-based tests exist to verify subdomain routing rules (e.g. assessment authoring blocked on `admin.*`).
- **top30_mismatches_tracked**: `docs/api/MISMATCHES_TOP30.md` exists (forces explicit triage and prevents “unknown unknowns”).

This is intentionally simple and trendable; it’s not meant to be perfect.

