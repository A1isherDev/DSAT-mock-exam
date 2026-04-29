from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .api import AppError


def core_exception_handler(exc: Exception, context: dict) -> Response | None:
    """
    DRF exception handler that standardizes AppError into a stable envelope.
    Falls back to DRF default handler for everything else.
    """
    if isinstance(exc, AppError):
        body: dict = {"detail": exc.detail}
        if exc.code:
            body["code"] = exc.code
        if exc.context_id:
            body["context_id"] = exc.context_id
        return Response(body, status=int(getattr(exc, "status_code", 400) or 400))

    return drf_exception_handler(exc, context)

