## Complexity + impact metrics (trendable)

This repo tracks a few **cheap-to-compute** metrics that can trend in CI as “platform hardening”
work progresses.

### Script
Run:

```bash
python scripts/complexity_report.py
```

### Current metrics (definitions)
- **core_py_files**: number of Python files under `backend/core/**`. Should increase initially,
  then stabilize as domains migrate.
- **metrics_wrong_staff_endpoint_total_refs**: references to the telemetry counter for staff
  consoles calling public endpoints. Should remain (it’s intended), but ideally becomes more
  centralized (fewer call sites).
- **metrics_forbidden_admin_route_total_refs**: references to forbidden route counter.
- **frontend_no_restricted_imports_rules**: number of `no-restricted-imports` rules in
  `frontend/eslint.config.mjs`. Should increase carefully as guardrails are added.
- **backend_subdomain_regression_tests**: count of backend regression tests that mention
  subdomain/host behaviors.

