"""View/action-level authorization for exams admin APIs (permission + ABAC)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import authorize, filter_mock_exams_for_user, filter_practice_tests_for_user, get_effective_permission_codenames


def _can_view_practice_test(user, practice_test) -> bool:
    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms or constants.PERM_VIEW_ALL_TESTS in perms:
        return True
    if (
        constants.PERM_VIEW_ENGLISH_TESTS in perms
        and practice_test.subject == constants.SUBJECT_ENGLISH_PLATFORM
    ):
        return True
    if (
        constants.PERM_VIEW_MATH_TESTS in perms
        and practice_test.subject == constants.SUBJECT_MATH_PLATFORM
    ):
        return True
    return False


class PracticeTestAdminAccess(BasePermission):
    """Admin CRUD on PracticeTest rows (list/create/retrieve/update/delete)."""

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        if act in ("list", "retrieve", "head", "options"):
            perms = get_effective_permission_codenames(u)
            return bool(perms) and (
                constants.WILDCARD in perms
                or constants.PERM_VIEW_ALL_TESTS in perms
                or constants.PERM_VIEW_ENGLISH_TESTS in perms
                or constants.PERM_VIEW_MATH_TESTS in perms
                or constants.PERM_CREATE_TEST in perms
                or constants.PERM_EDIT_TEST in perms
                or constants.PERM_DELETE_TEST in perms
            )
        if act == "create":
            subj = (request.data or {}).get("subject")
            return authorize(u, constants.PERM_CREATE_TEST, subject=subj)
        if act in ("update", "partial_update", "destroy"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            return _can_view_practice_test(u, obj)
        if act in ("update", "partial_update"):
            return authorize(u, constants.PERM_EDIT_TEST, subject=obj.subject)
        if act == "destroy":
            return authorize(u, constants.PERM_DELETE_TEST, subject=obj.subject)
        return False


class MockExamAdminAccess(BasePermission):
    """
    Mock exam *shell* CRUD is limited to platform admins (view_all_tests or wildcard).
    Nested test operations use create/delete with ABAC; assignments use assign_test_access.
    """

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if not perms:
            return False
        if act in ("list", "retrieve", "head", "options"):
            return (
                constants.WILDCARD in perms
                or constants.PERM_VIEW_ALL_TESTS in perms
                or constants.PERM_VIEW_ENGLISH_TESTS in perms
                or constants.PERM_VIEW_MATH_TESTS in perms
                or constants.PERM_CREATE_TEST in perms
                or constants.PERM_EDIT_TEST in perms
                or constants.PERM_DELETE_TEST in perms
                or constants.PERM_ASSIGN_TEST_ACCESS in perms
            )
        if act in ("create", "update", "partial_update", "destroy"):
            return constants.WILDCARD in perms or constants.PERM_VIEW_ALL_TESTS in perms
        if act == "assign_users":
            return authorize(u, constants.PERM_ASSIGN_TEST_ACCESS)
        if act == "add_test":
            subj = (request.data or {}).get("subject")
            return authorize(u, constants.PERM_CREATE_TEST, subject=subj)
        if act == "remove_test":
            from exams.models import PracticeTest

            tid = (request.data or {}).get("test_id")
            pk = view.kwargs.get("pk")
            if not tid or not pk:
                return False
            try:
                t = PracticeTest.objects.get(pk=tid, mock_exam_id=pk)
            except PracticeTest.DoesNotExist:
                return False
            return authorize(u, constants.PERM_DELETE_TEST, subject=t.subject)
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("update", "partial_update", "destroy"):
            perms = get_effective_permission_codenames(u)
            return constants.WILDCARD in perms or constants.PERM_VIEW_ALL_TESTS in perms
        if act == "assign_users":
            return authorize(u, constants.PERM_ASSIGN_TEST_ACCESS)
        if act == "add_test":
            subj = (request.data or {}).get("subject")
            return authorize(u, constants.PERM_CREATE_TEST, subject=subj)
        if act == "remove_test":
            from exams.models import PracticeTest

            tid = (request.data or {}).get("test_id")
            if not tid:
                return False
            try:
                t = PracticeTest.objects.get(pk=tid, mock_exam_id=obj.pk)
            except PracticeTest.DoesNotExist:
                return False
            return authorize(u, constants.PERM_DELETE_TEST, subject=t.subject)
        return False


def _practice_test_from_module_view(view) -> "PracticeTest | None":
    from exams.models import Module, PracticeTest

    test_pk = view.kwargs.get("test_pk")
    module_pk = view.kwargs.get("module_pk")
    if not test_pk or not module_pk:
        return None
    try:
        mod = Module.objects.select_related("practice_test").get(
            pk=module_pk, practice_test_id=test_pk
        )
        return mod.practice_test
    except Module.DoesNotExist:
        return None


class ModuleNestedAdminAccess(BasePermission):
    """Modules under a practice test."""

    def has_permission(self, request, view):
        pt = _practice_test_from_module_view(view)
        if pt is None:
            return False
        if view.action in ("list", "retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action == "create":
            return authorize(request.user, constants.PERM_EDIT_TEST, subject=pt.subject)
        if view.action in ("update", "partial_update", "destroy"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy"):
            return authorize(request.user, constants.PERM_EDIT_TEST, subject=pt.subject)
        return False


class QuestionNestedAdminAccess(BasePermission):
    """Questions under module under practice test."""

    def has_permission(self, request, view):
        pt = _practice_test_from_module_view(view)
        if pt is None:
            return False
        if view.action in ("list", "retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action == "create":
            return authorize(request.user, constants.PERM_EDIT_TEST, subject=pt.subject)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.module.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return authorize(request.user, constants.PERM_EDIT_TEST, subject=pt.subject)
        return False


class BulkAssignAccess(BasePermission):
    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_ASSIGN_TEST_ACCESS)
