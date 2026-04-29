from __future__ import annotations

import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]


def exists(rel: str) -> bool:
    return (ROOT / rel).exists()


def count_text(rel: str, pattern: str) -> int:
    p = ROOT / rel
    if not p.exists():
        return 0
    try:
        txt = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return 0
    return len(re.findall(pattern, txt))


def main() -> int:
    openapi_enabled = 1 if exists("backend/openapi.yaml") else 0
    openapi_types_present = 1 if exists("frontend/src/lib/openapi-types.ts") else 0

    lint_boundaries_present = 1 if (
        count_text("frontend/eslint.config.mjs", r"src/components/bulk-assign/") > 0
        and count_text("frontend/eslint.config.mjs", r"src/app/\(teacher\)/") > 0
        and count_text("frontend/eslint.config.mjs", r"src/app/admin/") > 0
    ) else 0

    backend_host_guard_contract_tests = 1 if exists(
        "backend/assessments/tests/test_subdomain_guard_assessments_admin.py"
    ) else 0

    top30_mismatches_tracked = 1 if exists("docs/api/MISMATCHES_TOP30.md") else 0

    # Weighted score out of 100.
    score = (
        openapi_enabled * 25
        + openapi_types_present * 25
        + lint_boundaries_present * 20
        + backend_host_guard_contract_tests * 15
        + top30_mismatches_tracked * 15
    )

    print("api_stability_score")
    print(f"score={score}/100")
    print(f"openapi_enabled={openapi_enabled}")
    print(f"openapi_types_present={openapi_types_present}")
    print(f"lint_boundaries_present={lint_boundaries_present}")
    print(f"backend_host_guard_contract_tests={backend_host_guard_contract_tests}")
    print(f"top30_mismatches_tracked={top30_mismatches_tracked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

