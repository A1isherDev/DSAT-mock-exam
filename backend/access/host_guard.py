from __future__ import annotations

from dataclasses import dataclass

from django.http import JsonResponse


@dataclass(frozen=True)
class HostGuardConfig:
    admin_prefix: str = "admin."
    questions_prefix: str = "questions."


def _host_kind(host: str, cfg: HostGuardConfig) -> str:
    h = (host or "").split(":")[0].lower()
    if h.startswith(cfg.admin_prefix):
        return "admin"
    if h.startswith(cfg.questions_prefix):
        return "questions"
    return "main"


class SubdomainAPIGuardMiddleware:
    """
    Enforce coarse separation of consoles by subdomain:
    - admin.<domain>: users + bulk-assign only (plus GET-only reads needed by UI)
    - questions.<domain>: tests/questions CRUD endpoints
    - main domain: student/teacher portal APIs
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.cfg = HostGuardConfig()

    def __call__(self, request):
        path = request.path or ""
        host = request.get_host()
        kind = _host_kind(host, self.cfg)
        method = (request.method or "GET").upper()
        # Make console kind available to downstream handlers (views/serializers/etc).
        setattr(request, "lms_console", kind)

        # Non-API paths are unaffected.
        if not path.startswith("/api/"):
            return self.get_response(request)

        # Auth endpoints always allowed.
        if path.startswith("/api/auth/"):
            return self.get_response(request)

        # Role-level gate (before endpoint allowlists).
        # - testers (test_admin) may NOT use admin console subdomain
        # - testers MAY use questions console subdomain
        u = getattr(request, "user", None)
        role = (
            str(getattr(u, "role", "") or "").strip().lower()
            if u and getattr(u, "is_authenticated", False)
            else ""
        )
        if kind == "admin" and role in ("test_admin", "student"):
            return JsonResponse(
                {"detail": "You cannot access admin console."}, status=403
            )
        if kind == "questions" and role == "student":
            return JsonResponse(
                {"detail": "Students cannot access questions console."}, status=403
            )

        # Admin subdomain: bulk assign + users + read-only exam lists.
        if kind == "admin":
            if path.startswith("/api/users/"):
                return self.get_response(request)
            if path.startswith("/api/exams/bulk_assign"):
                return self.get_response(request)
            # Allow GET-only reads for lists used by bulk assign UI.
            if path.startswith("/api/exams/admin/"):
                if method == "GET":
                    return self.get_response(request)
                return JsonResponse(
                    {
                        "detail": "Test authoring is disabled on admin subdomain. Use questions subdomain."
                    },
                    status=403,
                )
            return JsonResponse(
                {"detail": "This endpoint is not available on admin subdomain."}, status=403
            )

        # Questions subdomain: exams admin CRUD endpoints.
        if kind == "questions":
            if path.startswith("/api/exams/admin/"):
                return self.get_response(request)
            # Still allow bulk assign if desired from questions (harmless), but not required.
            if path.startswith("/api/exams/bulk_assign"):
                return self.get_response(request)
            # Users are intentionally not available here.
            if path.startswith("/api/users/"):
                return JsonResponse({"detail": "Users console is available on admin subdomain."}, status=403)
            return self.get_response(request)

        # Main domain: block admin/test authoring endpoints.
        if path.startswith("/api/exams/admin/"):
            return JsonResponse({"detail": "Admin authoring endpoints require questions subdomain."}, status=403)

        return self.get_response(request)

