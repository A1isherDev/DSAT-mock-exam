from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response


def idempotency_key_from_request(request) -> str | None:
    """
    Shared convention for idempotent mutation endpoints.
    """
    try:
        h = request.headers
    except Exception:
        h = {}
    key = (h.get("Idempotency-Key") or h.get("X-Idempotency-Key") or "").strip()
    return key or None


def conflict_response(
    *,
    detail: str,
    code: str,
    extra: dict | None = None,
    http_status: int = status.HTTP_409_CONFLICT,
) -> Response:
    body = {"detail": detail, "code": code}
    if extra:
        body.update(extra)
    return Response(body, status=http_status)

