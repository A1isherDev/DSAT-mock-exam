"""DRF permission classes built on permission codenames (no role string checks in views)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import (
    authorize,
    get_effective_permission_codenames,
    platform_subject_for_user,
)


class HasLMSPermission(BasePermission):
    """Set ``permission_codename`` on the view or subclass."""

    permission_codename: str = ""

    def has_permission(self, request, view):
        code = getattr(view, "permission_codename", None) or self.permission_codename
        if not code:
            return False
        subj = getattr(view, "permission_subject", None)
        return authorize(request.user, code, subject=subj)


class HasManageUsers(BasePermission):
    def has_permission(self, request, view):
        return authorize(
            request.user,
            constants.PERM_MANAGE_USERS,
            subject=platform_subject_for_user(request.user),
        )


class HasManageUsersOrAssignTestAccess(BasePermission):
    """List users for admin UI: user managers or subject-scoped staff who can assign access."""

    def has_permission(self, request, view):
        subj = platform_subject_for_user(request.user)
        return authorize(
            request.user, constants.PERM_MANAGE_USERS, subject=subj
        ) or authorize(request.user, constants.PERM_ASSIGN_ACCESS, subject=subj)


class HasManageRoles(BasePermission):
    def has_permission(self, request, view):
        return authorize(
            request.user,
            constants.PERM_ASSIGN_ACCESS,
            subject=platform_subject_for_user(request.user),
        )


class HasManageClassrooms(BasePermission):
    def has_permission(self, request, view):
        return authorize(
            request.user,
            constants.PERM_CREATE_CLASSROOM,
            subject=platform_subject_for_user(request.user),
        )


class RequiresSubmitTest(BasePermission):
    """Student test-taking flows (attempts, modules, review)."""

    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_SUBMIT_TEST)
