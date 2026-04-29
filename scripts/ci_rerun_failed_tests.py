from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class RunResult:
    code: int
    out: str


FAIL_RE = re.compile(r"^FAIL:\s+(?P<test>\S+)\s+\((?P<case>[\w\.]+)\)\s*$", re.MULTILINE)
ERROR_RE = re.compile(r"^ERROR:\s+(?P<test>\S+)\s+\((?P<case>[\w\.]+)\)\s*$", re.MULTILINE)


def _run(cmd: list[str]) -> RunResult:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return RunResult(p.returncode, p.stdout)


def _extract_failed_tests(output: str) -> list[str]:
    failed: list[str] = []
    for m in list(FAIL_RE.finditer(output)) + list(ERROR_RE.finditer(output)):
        # Django supports "module.Class.test_method" as a test label.
        failed.append(f"{m.group('case')}.{m.group('test')}")
    # Deduplicate while keeping order.
    seen = set()
    out = []
    for x in failed:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def main() -> int:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(repo_root, "backend")

    env = os.environ.copy()
    env.setdefault("SECRET_KEY", "ci-secret-key")
    env.setdefault("DEBUG", "True")

    base_cmd = [sys.executable, "manage.py", "test", "-v", "2"]
    r1 = subprocess.run(base_cmd, cwd=backend_dir, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    sys.stdout.write(r1.stdout)
    if r1.returncode == 0:
        return 0

    failed = _extract_failed_tests(r1.stdout)
    if not failed:
        # Unknown failure format; fail hard.
        return r1.returncode or 1

    sys.stdout.write("\n[flaky-detector] Re-running failed tests once:\n")
    for t in failed:
        sys.stdout.write(f" - {t}\n")

    r2 = subprocess.run(
        [sys.executable, "manage.py", "test", "-v", "2", *failed],
        cwd=backend_dir,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    sys.stdout.write(r2.stdout)

    if r2.returncode == 0:
        sys.stdout.write("\n[flaky-detector] FAILURES PASSED ON RERUN -> FLAKY\n")
        return 2

    return r1.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())

