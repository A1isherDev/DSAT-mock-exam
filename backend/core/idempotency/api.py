from __future__ import annotations

"""
Core idempotency adapter.

Initial goal: provide a stable import path for idempotency that delegates to the existing
request parsing and domain implementations (no behavior changes).
"""

from typing import Callable

from rest_framework.response import Response

from config.reliability import idempotency_key_from_request
from exams.idempotency import consume_idempotency_key as _consume_exam_attempt_idem


def consume(*, attempt, endpoint: str, request, compute: Callable[[], Response], ttl_seconds: int = 10 * 60) -> Response:
    """
    Consume an idempotency key for an attempt-scoped mutating endpoint.

    Adapter to `exams.idempotency.consume_idempotency_key` (attempt DB-backed storage).
    """
    key = idempotency_key_from_request(request)
    return _consume_exam_attempt_idem(attempt=attempt, endpoint=endpoint, key=key, compute=compute, ttl_seconds=ttl_seconds)


__all__ = ["consume", "idempotency_key_from_request"]

