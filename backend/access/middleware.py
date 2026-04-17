"""
API authentication + staff subject sanity checks.

JWT is validated here so `request.user` is populated before `SubdomainAPIGuardMiddleware`
(which must see roles for host-based API rules).
"""

from __future__ import annotations

from django.http import JsonResponse

from access import constants as C
from access.services import normalized_role, staff_must_have_subject, user_domain_subject


class JWTUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if path.startswith("/api/") and not getattr(request.user, "is_authenticated", False):
            try:
                from rest_framework_simplejwt.authentication import JWTAuthentication

                result = JWTAuthentication().authenticate(request)
                if result:
                    user, token = result
                    request.user = user
                    request.auth = token
            except Exception:
                pass
        return self.get_response(request)


class StaffSubjectRequiredMiddleware:
    """Teacher/admin must have exactly one configured domain subject."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if not path.startswith("/api/"):
            return self.get_response(request)
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)
        if staff_must_have_subject(user):
            if user_domain_subject(user) not in C.ALL_DOMAIN_SUBJECTS:
                return JsonResponse(
                    {"detail": "Staff account is missing a valid subject (math or english)."},
                    status=403,
                )
        return self.get_response(request)
