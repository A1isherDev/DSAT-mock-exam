from __future__ import annotations

import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_text(p: pathlib.Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")


def count_matches(glob: str, pattern: str) -> int:
    rx = re.compile(pattern)
    n = 0
    for p in ROOT.glob(glob):
        if p.is_dir():
            continue
        try:
            n += len(rx.findall(read_text(p)))
        except Exception:
            continue
    return n


def main() -> int:
    # Very small, stable measurements that can trend in CI.
    core_modules = sorted((ROOT / "backend" / "core").glob("**/*.py"))
    core_py_files = [p for p in core_modules if p.is_file()]

    # Endpoint consistency / guardrails (backend + frontend).
    wrong_staff_endpoint_metric = count_matches("backend/**/*.py", r"wrong_staff_endpoint_total")
    forbidden_admin_route_metric = count_matches("backend/**/*.py", r"forbidden_admin_route_total")

    # Frontend restrictions (lint rules for staff consoles).
    restricted_imports_rules = count_matches("frontend/eslint.config.mjs", r"no-restricted-imports")

    # Regression coverage proxy: how many host/subdomain regression tests exist.
    subdomain_tests = len(list((ROOT / "backend").glob("**/test_*subdomain*py"))) + len(
        list((ROOT / "backend").glob("**/test_*admin_main_domain*py"))
    )

    print("complexity_report")
    print(f"core_py_files={len(core_py_files)}")
    print(f"metrics_wrong_staff_endpoint_total_refs={wrong_staff_endpoint_metric}")
    print(f"metrics_forbidden_admin_route_total_refs={forbidden_admin_route_metric}")
    print(f"frontend_no_restricted_imports_rules={restricted_imports_rules}")
    print(f"backend_subdomain_regression_tests={subdomain_tests}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

