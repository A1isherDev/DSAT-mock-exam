"""DRF permission classes built on permission codenames (no role string checks in views)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import (
    actor_subject_probe_for_domain_perm,
    authorize,
    can_manage_questions,
    get_effective_permission_codenames,
)


class CanManageQuestions(BasePermission):
    """
    CRUD on ``/api/exams/admin/`` (mocks, pastpapers, tests, modules, questions).
    Any authenticated user except ``student``; Django superusers always allowed.
    """

    def has_permission(self, request, view):
        return can_manage_questions(request.user)

    def has_object_permission(self, request, view, obj):
        return can_manage_questions(request.user)


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
        subj = actor_subject_probe_for_domain_perm(request.user)
        return bool(subj and authorize(request.user, constants.PERM_MANAGE_USERS, subject=subj))


class HasManageUsersOrAssignTestAccess(BasePermission):
    """List users for admin UI: user managers or subject-scoped staff who can assign access."""

    def has_permission(self, request, view):
        subj = actor_subject_probe_for_domain_perm(request.user)
        return bool(
            subj
            and (
                authorize(request.user, constants.PERM_MANAGE_USERS, subject=subj)
                or authorize(request.user, constants.PERM_ASSIGN_ACCESS, subject=subj)
            )
        )


class HasManageRoles(BasePermission):
    def has_permission(self, request, view):
        subj = actor_subject_probe_for_domain_perm(request.user)
        return bool(subj and authorize(request.user, constants.PERM_ASSIGN_ACCESS, subject=subj))


class HasManageClassrooms(BasePermission):
    def has_permission(self, request, view):
        subj = actor_subject_probe_for_domain_perm(request.user)
        return bool(subj and authorize(request.user, constants.PERM_CREATE_CLASSROOM, subject=subj))


class RequiresSubmitTest(BasePermission):
    """Student test-taking flows (attempts, modules, review)."""

    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_SUBMIT_TEST)
