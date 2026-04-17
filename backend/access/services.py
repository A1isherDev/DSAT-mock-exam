from __future__ import annotations

"""
LMS authorization — **use these entry points and no ad‑hoc shortcuts**.

1. **Permission + resource subject (platform string)**  
   ``authorize(user, "<perm>", subject="<MATH|READING_WRITING>")``  
   See ``constants.PERMISSIONS_REQUIRING_PLATFORM_SUBJECT``. For the signed-in staff
   member's own domain, use ``platform_subject_for_user(user)`` as ``subject``.

2. **Database access (domain string)**  
   ``has_global_subject_access`` / ``has_access_for_classroom`` / ``student_has_any_subject_grant``  
   — always pass ``math`` / ``english`` (``constants.DOMAIN_*``), never platform strings.

3. **Converting** platform ↔ domain at boundaries — **only** ``access.subject_mapping``.
"""

from functools import lru_cache
from typing import FrozenSet, Optional

import logging

from django.apps import apps
from django.db.models import Q

from . import constants
from .exceptions import SubjectContractViolation
from .subject_mapping import (
    domain_subject_to_platform,
    platform_subject_to_domain,
    validate_authorize_subject,
    validate_domain_subject_arg,
)

logger = logging.getLogger("access.authorize")


@lru_cache(maxsize=1)
def _role_permissions_map() -> dict[str, FrozenSet[str]]:
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


def normalized_role(user) -> str:
    if not user or not getattr(user, "is_authenticated", False):
        return constants.ROLE_STUDENT
    raw = getattr(user, "role", None)
    if not isinstance(raw, str) or not raw.strip():
        return constants.ROLE_STUDENT
    v = raw.strip().lower()
    if v in constants.CANONICAL_ROLES:
        return v
    return constants.ROLE_STUDENT


def bulk_assign_request_platform_subjects(data: object) -> frozenset[str]:
    """
    Collect all platform subjects (MATH / READING_WRITING) touched by a bulk_assign payload.

    Used so ``authorize(PERM_ASSIGN_ACCESS, subject=...)`` can be evaluated per subject
    at the permission gate (fail closed; no silent cross-subject entry).
    """
    if not isinstance(data, dict):
        return frozenset()

    def _ints(seq):
        out: list[int] = []
        for x in seq or []:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out

    from exams.models import PracticeTest

    subjects: set[str] = set()
    for pk in _ints(data.get("practice_test_ids")):
        sub = (
            PracticeTest.objects.filter(pk=pk, mock_exam__isnull=True)
            .values_list("subject", flat=True)
            .first()
        )
        if sub:
            subjects.add(str(sub))

    exam_ids = _ints(data.get("exam_ids"))
    if exam_ids:
        assignment_type = data.get("assignment_type", "FULL")
        subject_map = {
            "MATH": (["MATH"], ["READING_WRITING"]),
            "ENGLISH": (["READING_WRITING"], ["MATH"]),
            "FULL": (["MATH", "READING_WRITING"], []),
        }
        to_add_subjects, _ = subject_map.get(assignment_type, (["MATH", "READING_WRITING"], []))
        if to_add_subjects:
            qs = PracticeTest.objects.filter(mock_exam_id__in=exam_ids, subject__in=to_add_subjects)
            form_type = data.get("form_type")
            if form_type:
                qs = qs.filter(form_type=form_type)
            subjects.update(qs.values_list("subject", flat=True))

    return frozenset(s for s in subjects if s)


def user_domain_subject(user) -> Optional[str]:
    """
    Single domain subject for staff (math|english). None means unrestricted for that role context:
    - super_admin / django superuser handled elsewhere
    - test_admin: always unrestricted (full math + english authoring); ``user.subject`` is ignored
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False) or normalized_role(user) == constants.ROLE_SUPER_ADMIN:
        return None
    if normalized_role(user) == constants.ROLE_TEST_ADMIN:
        return None
    raw = getattr(user, "subject", None)
    if isinstance(raw, str) and raw.strip().lower() in constants.ALL_DOMAIN_SUBJECTS:
        return raw.strip().lower()
    return None


def platform_subject_for_user(user) -> Optional[str]:
    """
    Platform subject (``MATH`` / ``READING_WRITING``) for the current user's **single**
    LMS domain, suitable as ``authorize(..., subject=...)`` for *actor-context* checks.

    Returns ``None`` for super_admin, Django superuser, or users without a domain row
    (e.g. students) — callers must decide whether that is valid for their permission.
    """
    return domain_subject_to_platform(user_domain_subject(user))


def _user_access_model():
    return apps.get_model("access", "UserAccess")


def has_global_subject_access(user, domain_subject: str) -> bool:
    """
    **When to use:** decide if the user may act *across the whole domain* (``math`` /
    ``english``) using only **global** ``UserAccess`` rows (``classroom_id`` is NULL).

    **Not for:** classroom-scoped checks (use ``has_access_for_classroom``) or “any row”
    student eligibility (use ``student_has_any_subject_grant``).

    **Parameters:** ``domain_subject`` is always ``constants.DOMAIN_MATH`` or
    ``constants.DOMAIN_ENGLISH`` — never ``MATH`` / ``READING_WRITING``.

    Teacher/admin: ``user.subject`` must match ``domain_subject`` before any DB query.
    ``test_admin`` without ``user.subject``: returns True for any domain (org-wide test staff).

    Raises ``SubjectContractViolation`` if a platform subject string is passed by mistake.
    """
    validate_domain_subject_arg("has_global_subject_access", domain_subject)
    if domain_subject not in constants.ALL_DOMAIN_SUBJECTS:
        return False
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or normalized_role(user) == constants.ROLE_SUPER_ADMIN:
        return True

    role = normalized_role(user)
    UserAccess = _user_access_model()

    if role in (constants.ROLE_TEACHER, constants.ROLE_ADMIN):
        if user_domain_subject(user) != domain_subject:
            return False
        return UserAccess.objects.filter(
            user_id=user.pk,
            subject=domain_subject,
            classroom_id__isnull=True,
        ).exists()

    if role == constants.ROLE_STUDENT:
        return UserAccess.objects.filter(
            user_id=user.pk,
            subject=domain_subject,
            classroom_id__isnull=True,
        ).exists()

    if role == constants.ROLE_TEST_ADMIN:
        return True

    return False


def has_access_for_classroom(user, domain_subject: str, classroom_id: int) -> bool:
    """
    **When to use:** the resource is tied to **one classroom id** (grant flow, class-scoped
    admin). True if the user has a **global** grant in ``domain_subject`` *or* a row for
    that ``classroom_id`` (same domain).

    **Not for:** platform-wide permission checks — use ``authorize`` + platform subject.

    **Parameters:** ``domain_subject`` is ``DOMAIN_MATH`` / ``DOMAIN_ENGLISH`` only.

    Raises ``SubjectContractViolation`` if a platform subject string is passed by mistake.
    """
    validate_domain_subject_arg("has_access_for_classroom", domain_subject)
    if domain_subject not in constants.ALL_DOMAIN_SUBJECTS:
        return False
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or normalized_role(user) == constants.ROLE_SUPER_ADMIN:
        return True

    role = normalized_role(user)
    UserAccess = _user_access_model()
    cid = int(classroom_id)

    if role == constants.ROLE_STUDENT:
        return UserAccess.objects.filter(user_id=user.pk, subject=domain_subject).filter(
            Q(classroom_id__isnull=True) | Q(classroom_id=cid)
        ).exists()

    if role in (constants.ROLE_TEACHER, constants.ROLE_ADMIN):
        if user_domain_subject(user) != domain_subject:
            return False
        return UserAccess.objects.filter(user_id=user.pk, subject=domain_subject).filter(
            Q(classroom_id__isnull=True) | Q(classroom_id=cid)
        ).exists()

    if role == constants.ROLE_TEST_ADMIN:
        return True

    return False


def student_has_any_subject_grant(user, domain_subject: str) -> bool:
    """
    **When to use:** **students only** — e.g. bulk-assign eligibility (“can this student
    receive content tagged with this domain?”). True if **any** ``UserAccess`` row exists
    for ``domain_subject`` (global **or** classroom-specific).

    **Not for:** ``authorize()`` (students use ``has_global_subject_access`` there so
    classroom-only enrollment is not treated as full-subject platform access).

    **Not for:** staff — returns False for non-students.

    Raises ``SubjectContractViolation`` if a platform subject string is passed by mistake.
    """
    validate_domain_subject_arg("student_has_any_subject_grant", domain_subject)
    if domain_subject not in constants.ALL_DOMAIN_SUBJECTS:
        return False
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if normalized_role(user) != constants.ROLE_STUDENT:
        return False
    return _user_access_model().objects.filter(user_id=user.pk, subject=domain_subject).exists()


def get_effective_permission_codenames(user) -> FrozenSet[str]:
    if not user or not getattr(user, "is_authenticated", False):
        return frozenset()
    if getattr(user, "is_superuser", False):
        return frozenset({constants.WILDCARD})

    UserPermission = apps.get_model("access", "UserPermission")
    role = normalized_role(user)
    granted: set[str] = set(_role_permissions_map().get(role, frozenset({constants.PERM_SUBMIT_TEST})))

    overrides = UserPermission.objects.filter(user_id=user.pk).select_related("permission")
    for ov in overrides:
        if ov.granted:
            if (
                role == constants.ROLE_STUDENT
                and ov.permission.codename in constants.PERMISSIONS_STUDENT_OVERRIDE_DENIED
            ):
                continue
            granted.add(ov.permission.codename)
        else:
            granted.discard(ov.permission.codename)

    if constants.WILDCARD in granted:
        return frozenset({constants.WILDCARD})
    return frozenset(granted)


def is_lms_staff_user(user) -> bool:
    perms = get_effective_permission_codenames(user)
    if not perms:
        return False
    if constants.WILDCARD in perms:
        return True
    return constants.PERM_MANAGE_USERS in perms or constants.PERM_VIEW_DASHBOARD in perms


def authorize(user, permission_codename: str, *, subject: Optional[str] = None) -> bool:
    """
    **The** permission API for views/policies: codename + optional **platform** ``subject``.

    * ``subject`` = ``constants.SUBJECT_MATH_PLATFORM`` or ``constants.SUBJECT_ENGLISH_PLATFORM``
      whenever ``permission_codename`` ∈ ``PERMISSIONS_REQUIRING_PLATFORM_SUBJECT``.
    * Do **not** pass ``math`` / ``english`` here — use ``subject_mapping.domain_subject_to_platform``.

    Exceptions where ``subject`` may be omitted (still in the set above):

    * ``super_admin`` / Django superuser.
    * ``test_admin`` (full math + english; ``user.subject`` is not used for ABAC).

    Permissions **outside** ``PERMISSIONS_REQUIRING_PLATFORM_SUBJECT`` (e.g.
    ``view_dashboard``, ``submit_test``): ignore ``subject``; pass ``None``.

    **Misuse guardrails:** If ``subject`` is provided for a domain-scoped permission, it must
    be a valid **platform** string; otherwise ``SubjectContractViolation`` is raised.
    If ``subject`` is omitted when required, the call returns ``False`` (deny) and logs a
    **warning** so missing wiring is visible in logs without changing HTTP semantics.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False

    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return True
    if permission_codename not in perms:
        return False

    if permission_codename not in constants.PERMISSIONS_REQUIRING_PLATFORM_SUBJECT:
        return True

    role = normalized_role(user)
    is_privileged = getattr(user, "is_superuser", False) or role == constants.ROLE_SUPER_ADMIN

    if subject is None:
        if is_privileged:
            return True
        if role == constants.ROLE_TEST_ADMIN:
            return True
        logger.warning(
            "authorize: missing subject= for required perm=%s role=%s user_id=%s "
            "(pass constants.SUBJECT_*_PLATFORM or platform_subject_for_user(user))",
            permission_codename,
            role,
            getattr(user, "pk", None),
        )
        return False

    validate_authorize_subject(subject)
    required = platform_subject_to_domain(subject)
    assert required in constants.ALL_DOMAIN_SUBJECTS

    if is_privileged:
        return True

    if role == constants.ROLE_TEST_ADMIN:
        return True

    if role in (constants.ROLE_TEACHER, constants.ROLE_ADMIN):
        return user_domain_subject(user) == required and has_global_subject_access(user, required)

    if role == constants.ROLE_STUDENT:
        return has_global_subject_access(user, required)

    return False


def can_browse_standalone_practice_library(user) -> bool:
    perms = get_effective_permission_codenames(user)
    if not perms:
        return False
    if constants.WILDCARD in perms:
        return True
    return constants.PERM_MANAGE_TESTS in perms


def filter_practice_tests_for_user(user, queryset):
    perms = get_effective_permission_codenames(user)
    if not perms:
        return queryset.none()
    if constants.WILDCARD in perms:
        return queryset

    role = normalized_role(user)
    if role == constants.ROLE_TEST_ADMIN:
        return queryset

    if constants.PERM_MANAGE_TESTS in perms and role in (constants.ROLE_TEACHER, constants.ROLE_ADMIN):
        dom = user_domain_subject(user)
        if dom == constants.DOMAIN_MATH:
            return queryset.filter(subject=constants.SUBJECT_MATH_PLATFORM)
        if dom == constants.DOMAIN_ENGLISH:
            return queryset.filter(subject=constants.SUBJECT_ENGLISH_PLATFORM)
        return queryset.none()

    return queryset.none()


def filter_pastpaper_packs_for_user(user, queryset):
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
    from django.db.models import Count

    from exams.models import PracticeTest

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
    subj = platform_subject_for_user(user)
    return authorize(user, constants.PERM_MANAGE_USERS, subject=subj) or authorize(
        user, constants.PERM_CREATE_CLASSROOM, subject=subj
    )


def staff_must_have_subject(user) -> bool:
    role = normalized_role(user)
    return role in (constants.ROLE_TEACHER, constants.ROLE_ADMIN)
