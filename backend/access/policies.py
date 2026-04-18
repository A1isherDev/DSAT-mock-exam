"""View/action-level authorization for exams admin APIs (permission + ABAC)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from . import constants
from .services import (
    actor_subject_probe_for_domain_perm,
    authorize,
    bulk_assign_request_platform_subjects,
    can_assign_all_platform_subjects_in_mock,
    can_edit_multi_subject_object,
    can_edit_tests,
    can_view_tests,
    debug_log_queryset_vs_can_view_tests,
    filter_mock_exams_for_user,
    filter_pastpaper_packs_for_user,
    filter_practice_tests_for_user,
    get_effective_permission_codenames,
)


def _can_view_practice_test(user, practice_test) -> bool:
    """List/retrieve: shared with queryset filtering via :func:`can_view_tests`."""
    from exams.models import PracticeTest

    ok = can_view_tests(user, practice_test.subject)
    debug_log_queryset_vs_can_view_tests(
        user, practice_test, filter_practice_tests_for_user(user, PracticeTest.objects.all())
    )
    return ok


class PracticeTestAdminAccess(BasePermission):
    """Admin CRUD on PracticeTest rows (list/create/retrieve/update/delete)."""

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        if act in ("list", "retrieve", "head", "options"):
            perms = get_effective_permission_codenames(u)
            if not perms:
                return False
            if constants.WILDCARD in perms:
                return True
            plat = actor_subject_probe_for_domain_perm(u)
            if not plat:
                return False
            return can_view_tests(u, plat)
        if act == "create":
            subj = (request.data or {}).get("subject")
            return can_edit_tests(u, subj)
        if act in ("update", "partial_update", "destroy"):
            return True  # subject enforced in ``has_object_permission``
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            return _can_view_practice_test(u, obj)
        if act in ("update", "partial_update"):
            return can_edit_tests(u, obj.subject)
        if act == "destroy":
            return can_edit_tests(u, obj.subject)
        return False


class PastpaperPackAdminAccess(BasePermission):
    """CRUD on PastpaperPack shells; add_section uses create_test + subject ABAC."""

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if act in ("list", "retrieve", "head", "options"):
            if not perms:
                return False
            if constants.WILDCARD in perms:
                return True
            plat = actor_subject_probe_for_domain_perm(u)
            if not plat:
                return False
            return can_view_tests(u, plat)
        if not perms:
            return False
        if act == "create":
            if constants.WILDCARD in perms:
                return True
            plat = actor_subject_probe_for_domain_perm(u)
            return bool(plat and can_edit_tests(u, plat))
        if act in ("update", "partial_update", "destroy"):
            return True
        if act == "add_section":
            subj = (request.data or {}).get("subject")
            return can_edit_tests(u, subj)
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if act in ("retrieve", "head", "options"):
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("update", "partial_update"):
            if constants.WILDCARD in perms:
                qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
                return qs.exists()
            if not can_edit_multi_subject_object(u, obj):
                return False
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "destroy":
            if constants.WILDCARD in perms:
                return True
            return can_edit_multi_subject_object(u, obj)
        if act == "add_section":
            qs = filter_pastpaper_packs_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        return False


class MockExamAdminAccess(BasePermission):
    """
    Timed mock shell: MOCK_SAT needs create_mock_sat; MIDTERM needs create_midterm_mock (or wildcard).
    Section add_test/remove_test on full mocks requires create_mock_sat-level access.
    """

    def _can_author_mock_sat_shell(self, u) -> bool:
        plat = actor_subject_probe_for_domain_perm(u)
        return bool(plat and can_edit_tests(u, plat))

    def has_permission(self, request, view):
        u = request.user
        act = view.action
        perms = get_effective_permission_codenames(u)
        if act in ("list", "retrieve", "head", "options"):
            if not perms:
                return False
            if constants.WILDCARD in perms:
                return True
            plat = actor_subject_probe_for_domain_perm(u)
            if not plat:
                return False
            return can_view_tests(u, plat)
        if not perms:
            return False
        if act == "create":
            if constants.WILDCARD in perms:
                return True
            from exams.models import MockExam

            kind = (request.data or {}).get("kind") or MockExam.KIND_MOCK_SAT
            if kind == MockExam.KIND_MIDTERM:
                subj = (request.data or {}).get("midterm_subject") or "READING_WRITING"
                return can_edit_tests(u, subj)
            plat = actor_subject_probe_for_domain_perm(u)
            return bool(plat and can_edit_tests(u, plat))
        if act in ("update", "partial_update", "destroy", "publish", "unpublish", "assign_users"):
            return True
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
            return can_edit_tests(u, t.subject)
        # remove_test uses same permission gate as manage_tests
        return False

    def has_object_permission(self, request, view, obj):
        u = request.user
        act = view.action
        if act in ("retrieve", "head", "options"):
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("update", "partial_update"):
            if not can_edit_multi_subject_object(u, obj):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "destroy":
            if not can_edit_multi_subject_object(u, obj):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act in ("publish", "unpublish"):
            if not can_edit_multi_subject_object(u, obj):
                return False
            qs = filter_mock_exams_for_user(u, type(obj).objects.filter(pk=obj.pk))
            return qs.exists()
        if act == "assign_users":
            return can_assign_all_platform_subjects_in_mock(u, obj)
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
            return can_edit_tests(u, t.subject)
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
            return can_edit_tests(request.user, pt.subject)
        if view.action in ("update", "partial_update", "destroy"):
            return can_edit_tests(request.user, pt.subject)
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy"):
            return can_edit_tests(request.user, pt.subject)
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
            return can_edit_tests(request.user, pt.subject)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return can_edit_tests(request.user, pt.subject)
        return False

    def has_object_permission(self, request, view, obj):
        pt = obj.module.practice_test
        if view.action in ("retrieve", "head", "options"):
            return _can_view_practice_test(request.user, pt)
        if view.action in ("update", "partial_update", "destroy", "reorder"):
            return can_edit_tests(request.user, pt.subject)
        return False


class BulkAssignAccess(BasePermission):
    def has_permission(self, request, view):
        subjects = bulk_assign_request_platform_subjects(request.data or {})
        if not subjects:
            return False
        return all(
            authorize(request.user, constants.PERM_ASSIGN_ACCESS, subject=s)
            for s in subjects
        )


class BulkAssignmentHistoryAccess(BasePermission):
    """
    List / re-run library bulk-assignment history (no request body on GET).

    Mirrors who may use the admin Assignments console: assign_access or manage_users
    in the actor's platform subject context, plus wildcard.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        perms = get_effective_permission_codenames(user)
        if constants.WILDCARD in perms:
            return True
        subj = actor_subject_probe_for_domain_perm(user)
        if not subj:
            return False
        return authorize(user, constants.PERM_ASSIGN_ACCESS, subject=subj) or authorize(
            user, constants.PERM_MANAGE_USERS, subject=subj
        )
