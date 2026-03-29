"""DRF permission classes built on permission codenames (no role string checks in views)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import authorize, get_effective_permission_codenames


class HasLMSPermission(BasePermission):
    """Set `permission_codename` on the view or subclass."""

    permission_codename: str = ""

    def has_permission(self, request, view):
        code = getattr(view, "permission_codename", None) or self.permission_codename
        if not code:
            return False
        return authorize(request.user, code)


class HasManageUsers(BasePermission):
    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_MANAGE_USERS)


class HasManageRoles(BasePermission):
    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_MANAGE_ROLES)


class HasManageClassrooms(BasePermission):
    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_MANAGE_CLASSROOMS)


class RequiresSubmitTest(BasePermission):
    """Student test-taking flows (attempts, modules, review)."""

    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_SUBMIT_TEST)
