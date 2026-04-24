from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from django.db import IntegrityError
from django.utils import timezone
from rest_framework.response import Response

from .models import AttemptIdempotencyKey, TestAttempt
from .metrics import incr as metric_incr


@dataclass(frozen=True)
class IdempotencyResult:
    hit: bool
    response: Response | None


def consume_idempotency_key(
    *,
    attempt: TestAttempt,
    endpoint: str,
    key: str | None,
    compute: Callable[[], Response],
    ttl_seconds: int = 10 * 60,
) -> Response:
    """
    Persist and replay responses for mutating endpoints.

    If key is None/empty, behaves like a normal compute() call.
    """
    k = (key or "").strip()
    if not k:
        return compute()

    now = timezone.now()
    row = (
        AttemptIdempotencyKey.objects.filter(
            attempt=attempt,
            endpoint=endpoint,
            key=k,
        )
        .order_by("-created_at")
        .first()
    )
    if row and row.expires_at and row.expires_at > now:
        metric_incr("idempotency_replay")
        return Response(row.response_json or {}, status=int(row.response_status or 200))

    res = compute()
    try:
        AttemptIdempotencyKey.objects.create(
            attempt=attempt,
            endpoint=str(endpoint),
            key=k,
            response_status=int(getattr(res, "status_code", 200) or 200),
            response_json=getattr(res, "data", None) if isinstance(getattr(res, "data", None), (dict, list)) else {},
            expires_at=now + timezone.timedelta(seconds=int(ttl_seconds)),
        )
    except IntegrityError:
        # Another identical request already created the row (double-click / retry / network replay).
        # Replay the existing response instead of crashing with 500.
        row = (
            AttemptIdempotencyKey.objects.filter(attempt=attempt, endpoint=endpoint, key=k)
            .order_by("-created_at")
            .first()
        )
        if row and row.expires_at and row.expires_at > now:
            metric_incr("idempotency_replay")
            return Response(row.response_json or {}, status=int(row.response_status or 200))
    return res

