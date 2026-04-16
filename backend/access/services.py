from __future__ import annotations

from functools import lru_cache
from typing import FrozenSet, Optional, Iterable

from django.apps import apps
from django.db.models import Q

from . import constants


@lru_cache(maxsize=1)
def _role_permissions_map() -> dict[str, FrozenSet[str]]:
    """
    Canonical RBAC mapping (single source of truth).

    Notes:
    - Scope (math/english) is enforced separately; permissions are subject-agnostic.
    - Teachers can create classrooms (Issue #3 requirement).
    """
    return {
        constants.ROLE_SUPER_ADMIN: frozenset({constants.WILDCARD}),
        constants.ROLE_ADMIN: frozenset(
            {
                constants.PERM_VIEW_DASHBOARD,
                constants.PERM_MANAGE_USERS,
                constants.PERM_ASSIGN_ACCESS,
                constants.PERM_CREATE_CLASSROOM,
                constants.PERM_MANAGE_TESTS,
                constants.PERM_SUBMIT_TEST,
            }
        ),
        constants.ROLE_TEACHER: frozenset(
            {
                constants.PERM_VIEW_DASHBOARD,
                constants.PERM_ASSIGN_ACCESS,
                constants.PERM_CREATE_CLASSROOM,
                constants.PERM_MANAGE_TESTS,
                constants.PERM_SUBMIT_TEST,
            }
        ),
        constants.ROLE_TEST_ADMIN: frozenset(
            {
                constants.PERM_VIEW_DASHBOARD,
                constants.PERM_MANAGE_TESTS,
                constants.PERM_SUBMIT_TEST,
            }
        ),
        constants.ROLE_STUDENT: frozenset({constants.PERM_SUBMIT_TEST}),
    }


def _normalized_role(user) -> str:
    """Return canonical role string; defaults to student."""
    if not user or not getattr(user, "is_authenticated", False):
        return constants.ROLE_STUDENT
    raw = getattr(user, "role", None)
    if isinstance(raw, str) and raw.strip():
        v = raw.strip()
        legacy = v.upper()
        if legacy == "SUPER_ADMIN":
            return constants.ROLE_SUPER_ADMIN
        if legacy in ("ADMIN", "ENGLISH_ADMIN", "MATH_ADMIN"):
            return constants.ROLE_ADMIN
        if legacy in ("TEACHER", "ENGLISH_TEACHER", "MATH_TEACHER"):
            return constants.ROLE_TEACHER
        if legacy == "TEST_ADMIN":
            return constants.ROLE_TEST_ADMIN
        if legacy == "STUDENT":
            return constants.ROLE_STUDENT
        return v.lower()
    return constants.ROLE_STUDENT


def _normalized_scope(user) -> FrozenSet[str]:
    """
    Return normalized scope keys (math/english).
    Empty scope means no subject-domain access (strict by default).
    """
    raw = getattr(user, "scope", None)
    if raw is None:
        return frozenset()
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, Iterable):
        return frozenset()
    out: set[str] = set()
    for s in raw:
        if not isinstance(s, str):
            continue
        v = s.strip().lower()
        if not v:
            continue
        # tolerate accidental platform subjects in scope arrays
        if v in ("rw", "reading_writing", "reading-writing", "english"):
            out.add(constants.SCOPE_ENGLISH)
        elif v in ("math",):
            out.add(constants.SCOPE_MATH)
    # Fallback: some legacy/provisioned staff accounts may have empty scope.
    if not out:
        role = _normalized_role(user)
        raw_role = str(getattr(user, "role", "") or "").strip()
        legacy = raw_role.upper()

        # Subject-staff legacy roles.
        if legacy == "ENGLISH_TEACHER":
            return frozenset({constants.SCOPE_ENGLISH})
        if legacy == "MATH_TEACHER":
            return frozenset({constants.SCOPE_MATH})
        if legacy == "ENGLISH_ADMIN":
            return frozenset({constants.SCOPE_ENGLISH})
        if legacy == "MATH_ADMIN":
            return frozenset({constants.SCOPE_MATH})

        # Global staff defaults.
        if role in (constants.ROLE_ADMIN, constants.ROLE_TEST_ADMIN):
            return frozenset({constants.SCOPE_MATH, constants.SCOPE_ENGLISH})
        if role == constants.ROLE_TEACHER and legacy == "TEACHER":
            return frozenset({constants.SCOPE_MATH, constants.SCOPE_ENGLISH})
    return frozenset(out)


def subject_to_scope(subject: Optional[str]) -> Optional[str]:
    if subject is None:
        return None
    if subject == constants.SUBJECT_MATH_PLATFORM:
        return constants.SCOPE_MATH
    if subject == constants.SUBJECT_ENGLISH_PLATFORM:
        return constants.SCOPE_ENGLISH
    return None


def get_effective_permission_codenames(user) -> FrozenSet[str]:
    """
    Effective permission set for the authenticated user.

    Rules:
    - Django superusers always get wildcard.
    - Otherwise permissions are derived from canonical (role -> permissions) mapping.
    - User-level overrides via access.UserPermission are still honored when present.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return frozenset()

    if getattr(user, "is_superuser", False):
        return frozenset({constants.WILDCARD})

    UserPermission = apps.get_model("access", "UserPermission")

    role = _normalized_role(user)
    granted: set[str] = set(_role_permissions_map().get(role, frozenset({constants.PERM_SUBMIT_TEST})))

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
    """
    True if user may open staff/admin surfaces.

    Admin panel access is permission-based (Issue #1): manage_users => allow.
    """
    perms = get_effective_permission_codenames(user)
    if not perms:
        return False
    if constants.WILDCARD in perms:
        return True
    return constants.PERM_MANAGE_USERS in perms or constants.PERM_VIEW_DASHBOARD in perms


def authorize(user, permission_codename: str, *, subject: Optional[str] = None) -> bool:
    """
    Permission + scope enforcement.

    - Permission must be present (or wildcard).
    - If `subject` is provided and maps to a domain scope, the user must have that scope
      unless they are wildcard (super_admin).
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return True
    if permission_codename not in perms:
        return False

    required_scope = subject_to_scope(subject)
    if required_scope is None:
        return True
    user_scopes = _normalized_scope(user)
    return required_scope in user_scopes


def can_browse_standalone_practice_library(user) -> bool:
    """
    Users who may see the full pastpaper / standalone library on the student portal
    (/api/exams/...), not only rows assigned to them.
    """
    perms = get_effective_permission_codenames(user)
    if not perms:
        return False
    if constants.WILDCARD in perms:
        return True
    # Staff who manage tests can browse the full standalone library, scoped by domain.
    return constants.PERM_MANAGE_TESTS in perms


def filter_practice_tests_for_user(user, queryset):
    """Narrow PracticeTest queryset by scope (subject-domain enforcement)."""
    perms = get_effective_permission_codenames(user)
    if not perms:
        return queryset.none()
    if constants.WILDCARD in perms:
        return queryset

    scopes = _normalized_scope(user)
    q = Q(pk__in=[])
    if constants.SCOPE_ENGLISH in scopes:
        q |= Q(subject=constants.SUBJECT_ENGLISH_PLATFORM)
    if constants.SCOPE_MATH in scopes:
        q |= Q(subject=constants.SUBJECT_MATH_PLATFORM)
    return queryset.filter(q)


def filter_pastpaper_packs_for_user(user, queryset):
    """Packs with a visible section, plus empty shells for users who may add sections."""
    from django.db.models import Count

    from exams.models import PracticeTest

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return queryset

    visible = filter_practice_tests_for_user(
        user,
        PracticeTest.objects.filter(mock_exam__isnull=True),
    )
    with_sections = queryset.filter(sections__in=visible)
    if constants.PERM_MANAGE_TESTS in perms:
        empty = queryset.annotate(_section_count=Count("sections")).filter(_section_count=0)
        return (with_sections | empty).distinct()
    return with_sections.distinct()


def filter_mock_exams_for_user(user, queryset):
    """
    Visible MockExam rows for staff surfaces (admin APIs).
    For now we treat mock shells as part of "manage_tests", and still enforce scope via the
    PracticeTest sections attached to the mock.
    """
    from django.db.models import Count

    from exams.models import MockExam, PracticeTest

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return queryset
    if constants.PERM_MANAGE_TESTS not in perms and constants.PERM_ASSIGN_ACCESS not in perms:
        return queryset.none()

    visible_tests = filter_practice_tests_for_user(user, PracticeTest.objects.all())
    with_tests = queryset.filter(tests__in=visible_tests)
    if constants.PERM_MANAGE_TESTS in perms:
        empty_shells = queryset.annotate(_tc=Count("tests")).filter(_tc=0)
        return (with_tests | empty_shells).distinct()
    return with_tests.distinct()


def user_can_assign_as_class_teacher(user) -> bool:
    """Users who may be assigned as the group's teacher when creating a class."""
    return authorize(user, constants.PERM_MANAGE_USERS) or authorize(
        user, constants.PERM_CREATE_CLASSROOM
    )
