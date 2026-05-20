"""Cleanup middleware for legacy per-subdomain auth/CSRF cookies.

Background:
    The platform briefly ran with ``DEBUG=True`` in production, during which Django
    issued ``csrftoken`` / session cookies without an explicit ``Domain`` attribute —
    meaning each subdomain (``mastersat.uz``, ``admin.mastersat.uz``,
    ``questions.mastersat.uz``) stored its own scoped copy.

    After switching to ``DEBUG=False``, Django started emitting the same cookies with
    ``Domain=.mastersat.uz``. Browsers KEEP both cookies side-by-side. Requests now
    carry e.g. ``Cookie: csrftoken=OLD; csrftoken=NEW``. Django's cookie parser keeps
    the LAST occurrence; ``js-cookie`` reads the FIRST occurrence. The mismatch fails
    every unsafe write with ``CSRF token from the 'X-CSRFToken' HTTP header incorrect``.

What this middleware does:
    On every response, it detects requests that arrived with multiple ``csrftoken``
    cookies (the smoking gun) and explicitly clears the per-subdomain variant by
    emitting ``Set-Cookie: csrftoken=; Path=/; Max-Age=0`` (no Domain). After one
    response per affected subdomain, the duplicate is gone and the issue is resolved
    without user action.

    It does the same for the JWT cookies (``lms_access``, ``lms_refresh``) for the
    same reason — the same DEBUG-period regression affected them.

IMPORTANT: This middleware must NOT destroy fresh cookies that Django sets in the
    same response (e.g. ``sessionid`` on login, ``csrftoken`` rotation). It skips any
    cookie that already has the correct Domain=.mastersat.uz set by upstream middleware.
    The bare-subdomain duplicate will be cleaned on the next request.
"""

from __future__ import annotations

from http.cookies import Morsel

from django.conf import settings
from django.http import HttpRequest, HttpResponse

# Cookie names we manage globally with Domain=.mastersat.uz in production.
_MANAGED_COOKIE_NAMES = ("csrftoken", "lms_access", "lms_refresh", "sessionid")

# Subdomains where a legacy scoped variant might exist and needs deletion.
_SUBDOMAINS_TO_CLEAN: tuple[str, ...] = (
    "mastersat.uz",
    "www.mastersat.uz",
    "admin.mastersat.uz",
    "questions.mastersat.uz",
)


def _count_csrftoken_in_raw_cookie_header(raw_cookie: str) -> int:
    """Return how many ``csrftoken=`` segments appear in the raw Cookie header."""
    if not raw_cookie:
        return 0
    return sum(1 for chunk in raw_cookie.split(";") if chunk.strip().startswith("csrftoken="))


class LegacyCookieCleanupMiddleware:
    """Detect duplicate ``csrftoken``/auth cookies and emit deletion headers for the
    subdomain-scoped variant (so the only remaining one is ``Domain=.mastersat.uz``).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        raw_cookie = request.META.get("HTTP_COOKIE", "") or ""
        # Cheap check: only act when the smoking gun (multiple csrftoken) is present.
        had_duplicate_csrf = _count_csrftoken_in_raw_cookie_header(raw_cookie) > 1

        response: HttpResponse = self.get_response(request)

        if not had_duplicate_csrf:
            return response

        host = (request.get_host() or "").split(":")[0].lower()
        if not host or host not in _SUBDOMAINS_TO_CLEAN:
            return response

        secure = not settings.DEBUG
        cookie_domain = (getattr(settings, "SESSION_COOKIE_DOMAIN", "") or "").strip(".").lower()

        for name in _MANAGED_COOKIE_NAMES:
            # Check if Django already set a fresh cookie with the correct domain
            # in this response (e.g. sessionid on login, csrftoken rotation).
            # If so, DO NOT touch it — destroying it breaks login and CSRF.
            existing = response.cookies.get(name)
            if existing is not None:
                existing_domain = (existing.get("domain", "") or "").strip(".").lower()
                if existing_domain == cookie_domain and existing.value:
                    # Fresh cookie with correct domain — skip this one.
                    # The bare-subdomain duplicate will be cleaned on the next request.
                    continue

            # Safe to overwrite: either no cookie was set, or it was set without
            # the correct domain. Delete the bare-subdomain copy.
            if name in response.cookies:
                del response.cookies[name]
            morsel = Morsel()
            morsel.set(name, "", "")
            morsel["max-age"] = 0
            morsel["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
            morsel["path"] = "/"
            # Deliberately omit Domain — the deletion targets the bare-subdomain copy.
            morsel["samesite"] = "Lax"
            if secure:
                morsel["secure"] = True
            if name != "csrftoken":
                morsel["httponly"] = True
            response.cookies[name] = morsel

        return response
