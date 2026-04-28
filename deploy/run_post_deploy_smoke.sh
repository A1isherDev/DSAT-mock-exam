#!/usr/bin/env bash
set -euo pipefail

# Runs Playwright API smoke against a deployed environment.
#
# Required env:
# - PLAYWRIGHT_BASE_URL (e.g. https://mastersat.uz)
# - E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD / E2E_PRACTICE_TEST_ID
# - E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD / E2E_CLASSROOM_ID

if [[ -z "${PLAYWRIGHT_BASE_URL:-}" ]]; then
  echo "Missing PLAYWRIGHT_BASE_URL" >&2
  exit 2
fi

cd "$(dirname "$0")/../frontend"

npm test --silent || true

BASE_URL="${PLAYWRIGHT_BASE_URL}" npx playwright test tests/e2e/release_smoke_api.spec.ts

