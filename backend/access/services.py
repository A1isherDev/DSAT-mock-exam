from __future__ import annotations

from functools import lru_cache
from typing import FrozenSet, Optional

from django.apps import apps
from django.db.models import Q

from . import constants


def _role_code(user) -> Optional[str]:
    role = getattr(user, "system_role", None)
    if role is None:
        return None
    return role.code


def _role_id(user) -> Optional[int]:
    return getattr(user, "system_role_id", None)


def get_effective_permission_codenames(user) -> FrozenSet[str]:
    """
    Union role permissions + user grants − user denies.
    SUPER_ADMIN role carries the '*' wildcard (full access).
    """
    if not user or not getattr(user, "is_authenticated", False):
        return frozenset()

    RolePermission = apps.get_model("access", "RolePermission")
    UserPermission = apps.get_model("access", "UserPermission")
    Permission = apps.get_model("access", "Permission")

    rid = _role_id(user)
    if not rid:
        return frozenset({constants.PERM_SUBMIT_TEST})

    granted: set[str] = set(
        RolePermission.objects.filter(role_id=rid).values_list(
            "permission__codename", flat=True
        )
    )

    overrides = UserPermission.objects.filter(user_id=user.pk).select_related("permission")
    for ov in overrides:
        if ov.granted:
            granted.add(ov.permission.codename)
        else:
            granted.discard(ov.permission.codename)

    if constants.WILDCARD in granted:
        return frozenset({constants.WILDCARD})

    return frozenset(granted)


def is_lms_staff_user(user) -> bool:
    """True if user is not a pure student (used for legacy UI flags / cookies)."""
    perms = get_effective_permission_codenames(user)
    if not perms:
        return False
    if constants.WILDCARD in perms:
        return True
    return perms != frozenset({constants.PERM_SUBMIT_TEST})


def authorize(user, permission_codename: str, *, subject: Optional[str] = None) -> bool:
    """
    1) Permission must be present (or wildcard).
    2) ABAC: ENGLISH_ADMIN / MATH_ADMIN subject constraints for test operations & scoped views.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return True
    if permission_codename not in perms:
        return False

    rc = _role_code(user)
    if rc == constants.ROLE_ENGLISH_ADMIN:
        return _english_admin_allows(permission_codename, subject)
    if rc == constants.ROLE_MATH_ADMIN:
        return _math_admin_allows(permission_codename, subject)
    return True


def _english_admin_allows(permission_codename: str, subject: Optional[str]) -> bool:
    if permission_codename in (
        constants.PERM_VIEW_ENGLISH_TESTS,
        constants.PERM_CREATE_TEST,
        constants.PERM_EDIT_TEST,
        constants.PERM_ASSIGN_TEST_ACCESS,
    ):
        if subject is None:
            return True
        return subject == constants.SUBJECT_ENGLISH_PLATFORM
    return True


def _math_admin_allows(permission_codename: str, subject: Optional[str]) -> bool:
    if permission_codename in (
        constants.PERM_VIEW_MATH_TESTS,
        constants.PERM_CREATE_TEST,
        constants.PERM_EDIT_TEST,
        constants.PERM_ASSIGN_TEST_ACCESS,
    ):
        if subject is None:
            return True
        return subject == constants.SUBJECT_MATH_PLATFORM
    return True


def filter_practice_tests_for_user(user, queryset):
    """Narrow PracticeTest queryset by view_* permissions (no hardcoded role checks)."""
    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms or constants.PERM_VIEW_ALL_TESTS in perms:
        return queryset

    q = Q(pk__in=[])
    if constants.PERM_VIEW_ENGLISH_TESTS in perms:
        q |= Q(subject=constants.SUBJECT_ENGLISH_PLATFORM)
    if constants.PERM_VIEW_MATH_TESTS in perms:
        q |= Q(subject=constants.SUBJECT_MATH_PLATFORM)
    return queryset.filter(q)


def filter_mock_exams_for_user(user, queryset):
    """Mock exams that have at least one practice test visible to the user."""
    from exams.models import PracticeTest

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms or constants.PERM_VIEW_ALL_TESTS in perms:
        return queryset

    visible_tests = filter_practice_tests_for_user(user, PracticeTest.objects.all())
    return queryset.filter(tests__in=visible_tests).distinct()


def user_can_assign_as_class_teacher(user) -> bool:
    """Users who may be assigned as group teacher (replaces ad-hoc is_admin on User)."""
    return authorize(user, constants.PERM_MANAGE_USERS)
