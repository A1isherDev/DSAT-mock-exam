"""View/action-level authorization for exams admin APIs (permission + ABAC)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import (
    authorize,
    filter_mock_exams_for_user,
    filter_pastpaper_packs_for_user,
    filter_practice_tests_for_user,
    get_effective_permission_codenames,
)


def _can_view_practice_test(user, practice_test) -> bool:
    perms = get_effective_permission_codenames(user)
    if constants.WILDCARD in perms:
        return True
    if constants.PERM_MANAGE_TESTS not in perms:
        return False
    # subject-domain enforcement
    return authorize(user, constants.PERM_MANAGE_TESTS, subject=practice_test.subject)


class PracticeTestAdminAccess(BasePermission):
    """Admin CRUD on PracticeTest rows (list/create/retrieve/update/delete)."""

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        if act in ("list", "retrieve", "head", "options"):
            perms = get_effective_permission_codenames(u)
            return bool(perms) and (
                constants.WILDCARD in perms or constants.PERM_MANAGE_TESTS in perms
            )
        if act == "create":
            subj = (request.data or {}).get("subject")
            return authorize(u, constants.PERM_MANAGE_TESTS, subject=subj)
        if act in ("update", "partial_update", "destroy"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            return _can_view_practice_test(u, obj)
        if act in ("update", "partial_update"):
            return authorize(u, constants.PERM_MANAGE_TESTS, subject=obj.subject)
        if act == "destroy":
            return authorize(u, constants.PERM_MANAGE_TESTS, subject=obj.subject)
        return False


class PastpaperPackAdminAccess(BasePermission):
    """CRUD on PastpaperPack shells; add_section uses create_test + subject ABAC."""

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if not perms:
            return False
        if act in ("list", "retrieve", "head", "options"):
            return constants.WILDCARD in perms or constants.PERM_MANAGE_TESTS in perms
        if act == "create":
            return authorize(u, constants.PERM_MANAGE_TESTS)
        if act in ("update", "partial_update"):
            return authorize(u, constants.PERM_MANAGE_TESTS)
        if act == "destroy":
            return True
        if act == "add_section":
            subj = (request.data or {}).get("subject")
            return authorize(u, constants.PERM_MANAGE_TESTS, subject=subj)
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("update", "partial_update"):
            if not authorize(u, constants.PERM_MANAGE_TESTS):
                return False
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "destroy":
            sections = list(obj.sections.all())
            if not sections:
                return authorize(u, constants.PERM_MANAGE_TESTS)
            for t in sections:
                if not authorize(u, constants.PERM_MANAGE_TESTS, subject=t.subject):
                    return False
            return True
        if act == "add_section":
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        return False


class MockExamAdminAccess(BasePermission):
    """
    Timed mock shell: MOCK_SAT needs create_mock_sat; MIDTERM needs create_midterm_mock (or wildcard).
    Section add_test/remove_test on full mocks requires create_mock_sat-level access.
    """

    def _shell_admin(self, u) -> bool:
        perms = get_effective_permission_codenames(u)
        return constants.WILDCARD in perms or constants.PERM_MANAGE_TESTS in perms

    def _can_author_mock_sat_shell(self, u) -> bool:
        perms = get_effective_permission_codenames(u)
        return self._shell_admin(u)

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if not perms:
            return False
        if act in ("list", "retrieve", "head", "options"):
            return constants.WILDCARD in perms or (
                constants.PERM_MANAGE_TESTS in perms or constants.PERM_ASSIGN_ACCESS in perms
            )
        if act == "create":
            return authorize(u, constants.PERM_MANAGE_TESTS)
        if act in ("update", "partial_update"):
            return self._shell_admin(u) or authorize(u, constants.PERM_MANAGE_TESTS)
        if act == "destroy":
            return self._shell_admin(u) or authorize(u, constants.PERM_MANAGE_TESTS)
        if act in ("publish", "unpublish"):
            return self._shell_admin(u) or authorize(u, constants.PERM_MANAGE_TESTS)
        if act == "assign_users":
            return authorize(u, constants.PERM_ASSIGN_ACCESS)
        if act == "add_test":
            from exams.models import MockExam

            pk = view.kwargs.get("pk")
            if not pk:
                return False
            exam = MockExam.objects.filter(pk=pk).only("kind").first()
            if not exam or exam.kind != MockExam.KIND_MOCK_SAT:
                return False
            return self._can_author_mock_sat_shell(u)
        if act == "remove_test":
            from exams.models import MockExam, PracticeTest

            tid = (request.data or {}).get("test_id")
            pk = view.kwargs.get("pk")
            if not tid or not pk:
                return False
            try:
                t = PracticeTest.objects.select_related("mock_exam").get(pk=tid, mock_exam_id=pk)
            except PracticeTest.DoesNotExist:
                return False
            if not t.mock_exam or t.mock_exam.kind != MockExam.KIND_MOCK_SAT:
                return False
            return self._shell_admin(u) or authorize(u, constants.PERM_MANAGE_TESTS, subject=t.subject)
        # remove_test uses same permission gate as manage_tests
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("update", "partial_update"):
            if self._shell_admin(u):
                return True
            if not authorize(u, constants.PERM_MANAGE_TESTS):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "destroy":
            if self._shell_admin(u):
                return True
            if not authorize(u, constants.PERM_MANAGE_TESTS):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("publish", "unpublish"):
            if self._shell_admin(u):
                return True
            if not authorize(u, constants.PERM_MANAGE_TESTS):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "assign_users":
            return authorize(u, constants.PERM_ASSIGN_ACCESS)
        if act == "add_test":
            from exams.models import MockExam

            if obj.kind != MockExam.KIND_MOCK_SAT:
                return False
            return self._can_author_mock_sat_shell(u)
        if act == "remove_test":
            from exams.models import MockExam, PracticeTest

            tid = (request.data or {}).get("test_id")
            if not tid:
                return False
            try:
                t = PracticeTest.objects.select_related("mock_exam").get(pk=tid, mock_exam_id=obj.pk)
            except PracticeTest.DoesNotExist:
                return False
            if not t.mock_exam or t.mock_exam.kind != MockExam.KIND_MOCK_SAT:
                return False
            return self._shell_admin(u) or authorize(u, constants.PERM_MANAGE_TESTS, subject=t.subject)
        return False


def _practice_test_from_module_view(view) -> "PracticeTest | None":
    """Resolves parent test for question URLs: .../tests/<test_pk>/modules/<module_pk>/questions/."""
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


def _practice_test_for_admin_module_viewset(view) -> "PracticeTest | None":
    """
    AdminModuleViewSet URLs:
    - list/create: .../tests/<test_pk>/modules/  (no module id in kwargs)
    - detail: .../tests/<test_pk>/modules/<pk>/   (DRF uses pk, not module_pk)
    """
    from exams.models import Module, PracticeTest

    test_pk = view.kwargs.get("test_pk")
    if not test_pk:
        return None

    module_pk = view.kwargs.get("module_pk")
    if module_pk is not None:
        try:
            mod = Module.objects.select_related("practice_test").get(
                pk=module_pk, practice_test_id=test_pk
            )
            return mod.practice_test
        except Module.DoesNotExist:
            return None

    pk = view.kwargs.get("pk")
    if pk is not None:
        try:
            mod = Module.objects.select_related("practice_test").get(
                pk=pk, practice_test_id=test_pk
            )
            return mod.practice_test
        except Module.DoesNotExist:
            return None

    return PracticeTest.objects.filter(pk=test_pk).first()


class ModuleNestedAdminAccess(BasePermission):
    """Modules under a practice test."""

    def has_permission(self, request, view):
        pt = _practice_test_for_admin_module_viewset(view)
        if pt is None:
            return False
        if view.action in ("list", "retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action == "create":
            return authorize(request.user, constants.PERM_MANAGE_TESTS, subject=pt.subject)
        if view.action in ("update", "partial_update", "destroy"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy"):
            return authorize(request.user, constants.PERM_MANAGE_TESTS, subject=pt.subject)
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
            return authorize(request.user, constants.PERM_MANAGE_TESTS, subject=pt.subject)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.module.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return authorize(request.user, constants.PERM_MANAGE_TESTS, subject=pt.subject)
        return False


class BulkAssignAccess(BasePermission):
    def has_permission(self, request, view):
        return authorize(request.user, constants.PERM_ASSIGN_ACCESS)
