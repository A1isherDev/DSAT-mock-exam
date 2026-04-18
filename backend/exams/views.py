from rest_framework import viewsets, status, generics
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
import logging
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
import hashlib
import json
from django.db.models import Prefetch

from access import constants as acc_const
from access.permissions import RequiresSubmitTest
from access.policies import (
    BulkAssignAccess,
    BulkAssignmentHistoryAccess,
    MockExamAdminAccess,
    ModuleNestedAdminAccess,
    PastpaperPackAdminAccess,
    PracticeTestAdminAccess,
    QuestionNestedAdminAccess,
)
from access.services import (
    actor_subject_probe_for_domain_perm,
    authorize,
    bulk_assign_request_platform_subjects,
    can_browse_standalone_practice_library,
    filter_mock_exams_for_user,
    filter_pastpaper_packs_for_user,
    filter_practice_tests_for_user,
    get_effective_permission_codenames,
    normalized_role,
    student_has_any_subject_grant,
)
from access.subject_mapping import platform_subject_to_domain

from .library_bulk_assign import (
    execute_library_bulk_assign,
    infer_dispatch_kind,
    subject_summary_from_subjects,
)
from .models import (
    AuditLog,
    BulkAssignmentDispatch,
    MockExam,
    Module,
    PastpaperPack,
    PortalMockExam,
    PracticeTest,
    Question,
    TestAttempt,
    ensure_full_mock_practice_test_modules,
)
from .serializers import (
    MockExamSerializer,
    PortalMockExamStudentSerializer,
    PracticeTestSerializer,
    TestAttemptSerializer,
    ModuleSerializer,
    AdminMockExamSerializer,
    AdminPastpaperPackSerializer,
    AdminPracticeTestSerializer,
    AdminModuleSerializer,
    AdminQuestionSerializer,
    BulkAssignmentDispatchSerializer,
    BulkAssignmentDispatchDetailSerializer,
)

logger = logging.getLogger(__name__)

def _is_student(user) -> bool:
    return str(getattr(user, "role", "") or "").strip().lower() == "student"


def _actor_snapshot(user, *, subject: str | None) -> dict:
    if not getattr(user, "is_authenticated", False):
        return {}
    role = normalized_role(user)
    username = getattr(user, "username", None) or ""
    email = getattr(user, "email", None) or ""
    first_name = getattr(user, "first_name", None) or ""
    last_name = getattr(user, "last_name", None) or ""
    return {
        "id": user.pk,
        "role": role,
        "subject": subject,
        "username": username,
        "email": email,
        "name": (f"{first_name} {last_name}".strip() or username or email) or f"User #{user.pk}",
    }


def _idempotency_key_for_bulk_assign(actor, payload_core: dict) -> str:
    """
    Stable idempotency key derived from actor + normalized payload core.
    """
    base = {
        "actor_id": getattr(actor, "pk", None),
        "exam_ids": payload_core.get("exam_ids") or [],
        "practice_test_ids": payload_core.get("practice_test_ids") or [],
        "user_ids": payload_core.get("user_ids") or [],
        "assignment_type": payload_core.get("assignment_type") or "",
        "form_type": payload_core.get("form_type") or "",
    }
    blob = json.dumps(base, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class MockExamViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Timed diagnostic mocks (staff-authored sections, not the pastpaper library).
    List: PortalMockExam rows for students. Retrieve: mock shell + sections for /mock/:id.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MockExamSerializer

    def list(self, request, *args, **kwargs):
        user = request.user
        perms = get_effective_permission_codenames(user)
        if acc_const.WILDCARD in perms:
            return super().list(request, *args, **kwargs)
        if acc_const.PERM_MANAGE_TESTS in perms or acc_const.PERM_ASSIGN_ACCESS in perms:
            return super().list(request, *args, **kwargs)

        qs = (
            PortalMockExam.objects.filter(
                is_active=True,
                mock_exam__is_active=True,
                mock_exam__is_published=True,
                assigned_users=user,
            ).select_related("mock_exam")
        )
        return Response(PortalMockExamStudentSerializer(qs, many=True).data)

    def get_queryset(self):
        user = self.request.user
        perms = get_effective_permission_codenames(user)
        base = MockExam.objects.filter(is_active=True)
        tests_prefetch = Prefetch(
            "tests",
            queryset=PracticeTest.objects.all().prefetch_related("modules"),
        )
        if acc_const.WILDCARD in perms:
            return base.prefetch_related(tests_prefetch)
        if acc_const.PERM_MANAGE_TESTS in perms or acc_const.PERM_ASSIGN_ACCESS in perms:
            return filter_mock_exams_for_user(user, base).prefetch_related(tests_prefetch)

        allowed_mock_ids = PortalMockExam.objects.filter(
            is_active=True,
            mock_exam__is_active=True,
            mock_exam__is_published=True,
            assigned_users=user,
        ).values_list("mock_exam_id", flat=True)
        return (
            base.filter(id__in=allowed_mock_ids)
            .prefetch_related(tests_prefetch)
            .distinct()
        )


class PracticeTestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Pastpaper / skill practice only: standalone PracticeTest rows (no mock_exam).
    Timed mocks and their sections are only exposed via mock-exams + /mock/:id.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PracticeTestSerializer

    def get_queryset(self):
        """
        Students: standalone PracticeTest rows they are explicitly assigned to (assigned_users).
        No automatic “whole pack” unlock from one section — Math vs English access stay separate.
        Staff with test-library permissions: all standalone tests visible per ABAC
        (view_all / subject scopes / authoring perms), same as admin test lists.
        """
        user = self.request.user
        base = (
            PracticeTest.objects.filter(mock_exam__isnull=True)
            .select_related("mock_exam", "pastpaper_pack")
            .prefetch_related("modules")
        )
        if can_browse_standalone_practice_library(user):
            return filter_practice_tests_for_user(user, base).distinct()
        return base.filter(assigned_users=user).distinct()

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, BulkAssignAccess])
    def bulk_assign(self, request):
        def _as_int_ids(seq):
            out = []
            for x in seq or []:
                try:
                    out.append(int(x))
                except (TypeError, ValueError):
                    continue
            return out

        exam_ids = _as_int_ids(request.data.get("exam_ids"))
        practice_test_ids = _as_int_ids(request.data.get("practice_test_ids"))
        user_ids = _as_int_ids(request.data.get("user_ids"))
        assignment_type = request.data.get("assignment_type", "FULL")
        form_type = request.data.get("form_type")

        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = list(User.objects.filter(id__in=user_ids))

        if not user_ids:
            return Response({"detail": "user_ids is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not users:
            return Response({"detail": "No matching users for the given user_ids."}, status=status.HTTP_400_BAD_REQUEST)
        if not exam_ids and not practice_test_ids:
            return Response(
                {"detail": "Provide exam_ids (mock exams) and/or practice_test_ids (pastpaper tests)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload_core = {
            "exam_ids": exam_ids,
            "practice_test_ids": practice_test_ids,
            "user_ids": user_ids,
            "assignment_type": str(assignment_type or "FULL"),
            "form_type": str(form_type).strip() if form_type else None,
        }
        idempotency_key = _idempotency_key_for_bulk_assign(request.user, payload_core)
        window_start = timezone.now() - timedelta(minutes=10)
        existing = (
            BulkAssignmentDispatch.objects.filter(
                assigned_by=request.user,
                idempotency_key=idempotency_key,
                created_at__gte=window_start,
            )
            .exclude(status=BulkAssignmentDispatch.STATUS_FAILED)
            .order_by("-created_at")
            .first()
        )
        if existing:
            body = {
                "detail": "Duplicate bulk assignment detected within idempotency window.",
                "dispatch_id": existing.pk,
                "dispatch_status": existing.status,
            }
            if isinstance(existing.result, dict):
                body["result"] = existing.result
            return Response(body, status=status.HTTP_409_CONFLICT)

        raw_cc = request.data.get("client_context")
        allowed_cc = {
            "wizard_kind",
            "pastpaper_pack_id",
            "pastpaper_scope",
            "mock_exam_id",
            "content_label",
            "track_filter",
        }
        client_context = (
            {k: raw_cc[k] for k in allowed_cc if k in raw_cc}
            if isinstance(raw_cc, dict)
            else {}
        )
        payload = {
            **payload_core,
            "client_context": client_context,
        }

        subjects = bulk_assign_request_platform_subjects(payload_core)
        snapshot = _actor_snapshot(
            request.user,
            subject=(getattr(request.user, "subject", None) or ""),
        )

        dispatch = BulkAssignmentDispatch.objects.create(
            assigned_by=request.user,
            kind=infer_dispatch_kind(exam_ids, practice_test_ids),
            subject_summary="",
            students_requested_count=0,
            students_granted_count=0,
            status=BulkAssignmentDispatch.STATUS_PROCESSING,
            payload=payload,
            result={},
            actor_snapshot=snapshot,
            idempotency_key=idempotency_key,
            idempotency_expires_at=timezone.now() + timedelta(minutes=10),
        )

        try:
            with transaction.atomic():
                result = execute_library_bulk_assign(
                    actor=request.user,
                    exam_ids=exam_ids,
                    practice_test_ids=practice_test_ids,
                    user_ids=user_ids,
                    assignment_type=str(assignment_type or "FULL"),
                    form_type=str(form_type).strip() if form_type else None,
                )
        except Exception as exc:  # defensive: persist failure outcome
            dispatch.status = BulkAssignmentDispatch.STATUS_FAILED
            dispatch.result = {
                "error": exc.__class__.__name__,
                "detail": str(exc),
            }
            dispatch.save(update_fields=["status", "result"])
            raise

        dispatch.subject_summary = subject_summary_from_subjects(result.get("subjects_touched") or [])
        dispatch.students_requested_count = int(result.get("students_requested_count") or 0)
        dispatch.students_granted_count = int(result.get("students_granted_count") or 0)
        dispatch.status = BulkAssignmentDispatch.STATUS_COMPLETED
        dispatch.result = result
        dispatch.save(
            update_fields=[
                "subject_summary",
                "students_requested_count",
                "students_granted_count",
                "status",
                "result",
            ]
        )

        out = {
            **result,
            "dispatch_id": dispatch.pk,
            "dispatch_status": dispatch.status,
        }
        return Response(out)

class TestAttemptViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, RequiresSubmitTest]
    serializer_class = TestAttemptSerializer
    throttle_scope = "burst"

    def get_queryset(self):
        return TestAttempt.objects.filter(student=self.request.user)

    def create(self, request, *args, **kwargs):
        test_id = request.data.get("practice_test")
        user = request.user
        base = PracticeTest.objects.all().select_related("mock_exam", "pastpaper_pack")
        if can_browse_standalone_practice_library(user):
            allowed = filter_practice_tests_for_user(user, base).distinct()
        else:
            allowed = base.filter(assigned_users=user).distinct()

        test = get_object_or_404(allowed, id=test_id)
        
        # Get or create attempt (only reuse INCOMPLETE attempts)
        attempt = TestAttempt.objects.filter(
            student=request.user,
            practice_test=test,
            is_completed=False
        ).first()

        if not attempt:
            attempt = TestAttempt.objects.create(
                student=request.user,
                practice_test=test
            )
        
        AuditLog.objects.create(
            user=request.user,
            action="START_TEST",
            details=f"Started practice test: {test}"
        )
            
        serializer = self.get_serializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def start_module(self, request, pk=None):
        attempt = self.get_object()
        module_id = request.data.get('module_id')
        
        module = get_object_or_404(Module, id=module_id, practice_test=attempt.practice_test)
        
        if attempt.is_completed:
            return Response({'error': 'Cannot start module for a completed test'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not attempt.started_at:
            attempt.started_at = timezone.now()
            
        attempt.current_module = module
        attempt.current_module_start_time = timezone.now()
        attempt.save()
        
        AuditLog.objects.create(
            user=request.user,
            action="START_MODULE",
            details=f"Started module {module.module_order} of {attempt.practice_test}"
        )
        
        serializer = self.get_serializer(attempt)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def submit_module(self, request, pk=None):
        attempt = self.get_object()
        if not attempt.current_module:
            return Response({'error': 'No active module to submit'}, status=status.HTTP_400_BAD_REQUEST)
            
        module_answers = request.data.get('answers', {})
        flagged = request.data.get('flagged', [])
        current_mod_order = attempt.current_module.module_order if attempt.current_module else "?"
        
        try:
            attempt.submit_module(module_answers, flagged)
            
            AuditLog.objects.create(
                user=request.user,
                action="SUBMIT_MODULE",
                details=f"Submitted module {current_mod_order} of {attempt.practice_test}"
            )
            
            serializer = self.get_serializer(attempt)
            return Response(serializer.data)
        except Exception:
            logger.exception(
                "submit_module failed attempt_id=%s user_id=%s",
                getattr(attempt, "id", None),
                getattr(request.user, "id", None),
            )
            return Response({'error': 'Could not submit module.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def save_attempt(self, request, pk=None):
        attempt = self.get_object()
        if not attempt.current_module:
            return Response({'error': 'No active module to save'}, status=status.HTTP_400_BAD_REQUEST)
            
        module_answers = request.data.get('answers', {})
        flagged = request.data.get('flagged', [])
        
        attempt.module_answers[str(attempt.current_module.id)] = module_answers
        attempt.flagged_questions[str(attempt.current_module.id)] = flagged
        attempt.save()
        
        return Response({'status': 'saved'})

    @action(detail=True, methods=['get'])
    def review(self, request, pk=None):
        attempt = self.get_object()
        if not getattr(attempt, "is_completed", False):
            raise PermissionDenied("Review is available only after you submit the test.")
        module_id_param = request.query_params.get('module_id')
        
        questions_data = []
        total_answered = 0
        total_correct = 0
        total_questions = 0
        
        # Performance optimization: Fetch all relevant modules and questions at once
        relevant_module_ids = [mid for mid in attempt.module_answers.keys() 
                             if not module_id_param or str(mid) == str(module_id_param)]
        
        modules = Module.objects.filter(id__in=relevant_module_ids).prefetch_related('questions')
        modules_map = {str(m.id): m for m in modules}

        for module_id, answers in attempt.module_answers.items():
            if module_id_param and str(module_id) != str(module_id_param):
                continue
                
            module = modules_map.get(str(module_id))
            if not module: continue
            
            for q in module.questions.all():
                total_questions += 1
                ans = answers.get(str(q.id))
                
                is_correct = q.check_answer(ans)
                if ans is not None and str(ans).strip() != "": 
                    total_answered += 1
                    if is_correct: total_correct += 1
                
                questions_data.append({
                    'id': q.id,
                    'text': q.question_text,
                    'question_prompt': q.question_prompt,
                    'image': q.question_image.url if q.question_image else None,
                    'type': q.get_question_type_display(),
                    'student_answer': ans,
                    'correct_answers': q.correct_answers,
                    'is_correct': is_correct,
                    'is_math_input': q.is_math_input,
                    'options': q.get_options(),
                })
        
        total_skipped = total_questions - total_answered
        
        return Response({
            'questions': questions_data,
            'module_results': attempt.get_module_results(),
            'total_questions': total_questions,
            'total_answered': total_answered,
            'total_correct': total_correct,
            'total_incorrect': total_questions - total_correct - total_skipped,
            'total_skipped': total_skipped,
            'total_score': attempt.score,
            'score_percentage': (total_correct / total_questions * 100) if total_questions > 0 else 0
        })

# ── Admin CRUD Viewsets ───────────────────────────────────────────────────────

class AdminMockExamViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, MockExamAdminAccess]
    serializer_class = AdminMockExamSerializer

    def get_queryset(self):
        base = MockExam.objects.all().prefetch_related("tests__modules")
        return filter_mock_exams_for_user(self.request.user, base)

    def perform_create(self, serializer):
        exam = serializer.save()
        self._provision_exam_after_create(exam)

    def _provision_exam_after_create(self, exam: MockExam):
        """Auto-create practice tests: full mock → RW + Math; midterm → one test + custom modules."""
        if exam.kind == MockExam.KIND_MIDTERM:
            if exam.tests.exists():
                return
            cnt = min(2, max(1, exam.midterm_module_count or 1))
            m1 = max(1, exam.midterm_module1_minutes or 60)
            m2 = max(1, exam.midterm_module2_minutes or 60)
            subj = exam.midterm_subject or "READING_WRITING"
            pt = PracticeTest.objects.create(
                mock_exam=exam,
                subject=subj,
                form_type="INTERNATIONAL",
                skip_default_modules=True,
            )
            Module.objects.create(practice_test=pt, module_order=1, time_limit_minutes=m1)
            if cnt >= 2:
                Module.objects.create(practice_test=pt, module_order=2, time_limit_minutes=m2)
            return

        # Full SAT mock: admin adds R&W / Math sections via add_test (no forced two-section shell).

    @action(detail=True, methods=['post'])
    def assign_users(self, request, pk=None):
        exam = self.get_object()
        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = list(User.objects.filter(id__in=request.data.get("user_ids", [])))

        tests = list(exam.tests.all())
        required_domains: set[str] = set()
        for t in tests:
            d = platform_subject_to_domain(t.subject)
            if d is not None:
                required_domains.add(d)

        def _may_receive_mock_portal(u) -> bool:
            if normalized_role(u) != acc_const.ROLE_STUDENT:
                return True
            if not required_domains:
                return True
            return all(student_has_any_subject_grant(u, dom) for dom in required_domains)

        users = [u for u in users if _may_receive_mock_portal(u)]
        if not users and request.data.get("user_ids"):
            return Response(
                {
                    "detail": "No eligible users: students must have subject access matching this mock.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        can_all_sections = tests and all(
            authorize(request.user, acc_const.PERM_ASSIGN_ACCESS, subject=t.subject)
            for t in tests
        )

        if can_all_sections or not tests:
            exam.assigned_users.set(users)
            for test in tests:
                test.assigned_users.set(users)
            portal = PortalMockExam.objects.filter(mock_exam=exam).first()
            if portal:
                portal.assigned_users.set(users)
        else:
            touched = False
            for test in tests:
                if authorize(
                    request.user, acc_const.PERM_ASSIGN_ACCESS, subject=test.subject
                ):
                    test.assigned_users.set(users)
                    touched = True
            if touched:
                exam.assigned_users.add(*users)
                portal, _ = PortalMockExam.objects.get_or_create(
                    mock_exam=exam,
                    defaults={"is_active": bool(exam.is_published)},
                )
                portal.assigned_users.add(*users)
            elif request.data.get("user_ids"):
                return Response(
                    {
                        "detail": "You cannot assign student access for any section of this mock with your permissions."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        actor = request.user
        if getattr(actor, "is_superuser", False) or normalized_role(actor) == acc_const.ROLE_SUPER_ADMIN:
            logger.info(
                "mock_exam_assign_users super_actor_id=%s exam_id=%s user_count=%s",
                actor.pk,
                exam.pk,
                len(users),
            )
        return Response({"status": "assigned", "users_count": len(users)})

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        from django.utils import timezone

        from .publish_service import mock_exam_publish_ready

        exam = self.get_object()
        ok, msg = mock_exam_publish_ready(exam)
        if not ok:
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        exam.is_published = True
        exam.published_at = timezone.now()
        exam.save(update_fields=["is_published", "published_at", "updated_at"])
        portal, _ = PortalMockExam.objects.get_or_create(
            mock_exam=exam,
            defaults={"is_active": True},
        )
        portal.is_active = True
        portal.save(update_fields=["is_active", "updated_at"])
        if exam.assigned_users.exists():
            portal.assigned_users.set(exam.assigned_users.all())
        exam = MockExam.objects.prefetch_related("tests__modules__questions").get(pk=exam.pk)
        return Response(AdminMockExamSerializer(exam).data)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        exam = self.get_object()
        exam.is_published = False
        exam.published_at = None
        exam.save(update_fields=["is_published", "published_at", "updated_at"])
        PortalMockExam.objects.filter(mock_exam=exam).update(is_active=False)
        exam = MockExam.objects.prefetch_related("tests__modules__questions").get(pk=exam.pk)
        return Response(AdminMockExamSerializer(exam).data)

    @action(detail=True, methods=['post'])
    def add_test(self, request, pk=None):
        """Create a mock-only section (new items; do not reuse pastpaper PracticeTest rows)."""
        exam = self.get_object()
        if exam.kind == MockExam.KIND_MIDTERM:
            return Response(
                {
                    "error": "Midterm exams have a single section with custom modules; add questions under that test."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        subject = request.data.get('subject')
        label = request.data.get('label', '')
        form_type = request.data.get('form_type', 'INTERNATIONAL')
        
        if subject not in ('READING_WRITING', 'MATH'):
            return Response({'error': 'Invalid subject'}, status=status.HTTP_400_BAD_REQUEST)
        
        test = PracticeTest.objects.create(
            mock_exam=exam, 
            subject=subject,
            label=label,
            form_type=form_type
        )
        ensure_full_mock_practice_test_modules(test)
        from .serializers import AdminPracticeTestSerializer
        return Response(AdminPracticeTestSerializer(test).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'])
    def remove_test(self, request, pk=None):
        """Remove a PracticeTest from this MockExam."""
        test_id = request.data.get('test_id')
        test = get_object_or_404(PracticeTest, id=test_id, mock_exam=self.get_object())
        test.delete()
        return Response({'status': 'removed'})


class AdminPastpaperPackViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, PastpaperPackAdminAccess]
    serializer_class = AdminPastpaperPackSerializer

    def get_queryset(self):
        base = PastpaperPack.objects.all().prefetch_related(
            "sections__modules",
            "sections__assigned_users",
        )
        return filter_pastpaper_packs_for_user(self.request.user, base).order_by(
            "-practice_date", "-id"
        )

    def perform_update(self, serializer):
        pack = serializer.save()
        PracticeTest.objects.filter(pastpaper_pack=pack).update(
            practice_date=pack.practice_date,
            label=pack.label,
            form_type=pack.form_type,
        )

    @action(detail=True, methods=["post"])
    def add_section(self, request, pk=None):
        pack = self.get_object()
        subject = request.data.get("subject")
        if subject not in ("READING_WRITING", "MATH"):
            return Response({"detail": "Invalid subject."}, status=status.HTTP_400_BAD_REQUEST)
        if pack.sections.filter(subject=subject).exists():
            return Response(
                {"detail": "This pack already has that section."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        title = (request.data.get("title") or "").strip()
        pt = PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=pack,
            subject=subject,
            title=title,
            label=pack.label or "",
            form_type=pack.form_type or "INTERNATIONAL",
            practice_date=pack.practice_date,
        )
        pt = (
            PracticeTest.objects.filter(pk=pt.pk)
            .prefetch_related("modules", "assigned_users")
            .first()
        )
        return Response(AdminPracticeTestSerializer(pt).data, status=status.HTTP_201_CREATED)


class AdminPracticeTestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, PracticeTestAdminAccess]
    serializer_class = AdminPracticeTestSerializer

    def get_queryset(self):
        base = PracticeTest.objects.all().prefetch_related("modules", "assigned_users")
        qs = filter_practice_tests_for_user(self.request.user, base)
        standalone = self.request.query_params.get("standalone")
        if standalone in ("1", "true", "yes"):
            qs = qs.filter(mock_exam__isnull=True)
        return qs


class AdminModuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ModuleNestedAdminAccess]
    serializer_class = AdminModuleSerializer

    def get_queryset(self):
        return Module.objects.filter(practice_test_id=self.kwargs['test_pk'])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['test'] = get_object_or_404(PracticeTest, pk=self.kwargs['test_pk'])
        return ctx

    def perform_create(self, serializer):
        test = get_object_or_404(PracticeTest, pk=self.kwargs['test_pk'])
        serializer.save(practice_test=test)


from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db import models as db_models

class AdminQuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, QuestionNestedAdminAccess]
    serializer_class = AdminQuestionSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]


    def get_queryset(self):
        return Question.objects.filter(module_id=self.kwargs['module_pk'], module__practice_test_id=self.kwargs['test_pk'])

    def perform_create(self, serializer):
        module = get_object_or_404(Module, pk=self.kwargs['module_pk'], practice_test_id=self.kwargs['test_pk'])
        # Auto-assign order to the end
        max_order = self.get_queryset().aggregate(db_models.Max('order'))['order__max']
        serializer.save(
            module=module,
            order=(max_order + 1) if max_order is not None else 1
        )

    @action(detail=True, methods=['post'])
    def reorder(self, request, test_pk=None, module_pk=None, pk=None):
        question = self.get_object()
        action_type = request.data.get('action') # 'up' or 'down'
        queryset = self.get_queryset()
        
        if action_type == 'up':
            target = queryset.filter(order__lt=question.order).order_by('-order').first()
        elif action_type == 'down':
            target = queryset.filter(order__gt=question.order).order_by('order').first()
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
            
        if target:
            old_order = question.order
            question.order = target.order
            target.order = old_order
            question.save()
            target.save()
            return Response({'status': 'reordered'})
        return Response({'message': 'Already at boundary'}, status=status.HTTP_400_BAD_REQUEST)


def _as_int_ids_bulk(seq):
    out = []
    for x in seq or []:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _can_rerun_dispatch(actor, dispatch: BulkAssignmentDispatch) -> bool:
    if not getattr(actor, "is_authenticated", False):
        return False
    perms = get_effective_permission_codenames(actor)
    if acc_const.WILDCARD in perms:
        return True
    if dispatch.assigned_by_id and dispatch.assigned_by_id == actor.pk:
        return True
    subj = actor_subject_probe_for_domain_perm(actor)
    if subj and authorize(actor, acc_const.PERM_MANAGE_USERS, subject=subj):
        return True
    return False


class BulkAssignmentHistoryListView(generics.ListAPIView):
    """GET /api/exams/assignments/history/ — persisted library bulk-assign runs."""

    permission_classes = [IsAuthenticated, BulkAssignmentHistoryAccess]
    serializer_class = BulkAssignmentDispatchSerializer

    def get_queryset(self):
        user = self.request.user
        perms = get_effective_permission_codenames(user)
        qs = BulkAssignmentDispatch.objects.select_related("assigned_by").order_by("-created_at")
        if acc_const.WILDCARD in perms:
            return qs
        return qs.filter(assigned_by=user)


class BulkAssignmentHistoryDetailView(generics.RetrieveAPIView):
    """
    GET /api/exams/assignments/history/<id>/ — single dispatch detail.
    """

    permission_classes = [IsAuthenticated, BulkAssignmentHistoryAccess]
    serializer_class = BulkAssignmentDispatchDetailSerializer
    queryset = BulkAssignmentDispatch.objects.select_related("assigned_by")


class BulkAssignmentHistoryRerunView(APIView):
    """POST /api/exams/assignments/history/<id>/rerun/ — replay stored payload."""

    permission_classes = [IsAuthenticated, BulkAssignmentHistoryAccess]

    def post(self, request, pk):
        dispatch = get_object_or_404(
            BulkAssignmentDispatch.objects.select_related("assigned_by"),
            pk=pk,
        )
        if not _can_rerun_dispatch(request.user, dispatch):
            raise PermissionDenied("You may only re-run dispatches you created, unless you are a directory admin.")

        p = dispatch.payload or {}
        exam_ids = _as_int_ids_bulk(p.get("exam_ids"))
        practice_test_ids = _as_int_ids_bulk(p.get("practice_test_ids"))
        user_ids = _as_int_ids_bulk(p.get("user_ids"))
        assignment_type = p.get("assignment_type") or "FULL"
        form_type = p.get("form_type")
        form_type = str(form_type).strip() if form_type else None

        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = list(User.objects.filter(id__in=user_ids))
        if not user_ids or not users:
            return Response({"detail": "Stored payload is missing valid user_ids."}, status=status.HTTP_400_BAD_REQUEST)
        if not exam_ids and not practice_test_ids:
            return Response({"detail": "Stored payload is missing content ids."}, status=status.HTTP_400_BAD_REQUEST)

        subjects = bulk_assign_request_platform_subjects(
            {
                "exam_ids": exam_ids,
                "practice_test_ids": practice_test_ids,
                "assignment_type": assignment_type,
                "form_type": form_type,
            }
        )
        if not subjects or not all(
            authorize(request.user, acc_const.PERM_ASSIGN_ACCESS, subject=s) for s in subjects
        ):
            raise PermissionDenied("You are not allowed to re-run this assignment for the current subjects.")

        # Validate that at least one student is still eligible for the current subjects.
        eligible_any = False
        for u in users:
            if normalized_role(u) != acc_const.ROLE_STUDENT:
                continue
            for subj in subjects:
                dom = platform_subject_to_domain(subj)
                if dom and student_has_any_subject_grant(u, dom):
                    eligible_any = True
                    break
            if eligible_any:
                break
        if not eligible_any:
            return Response(
                {
                    "detail": "Rerun would skip all target students for the current subjects; no eligible students remain.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        prev_cc = p.get("client_context")
        client_context = prev_cc if isinstance(prev_cc, dict) else {}
        payload = {
            "exam_ids": exam_ids,
            "practice_test_ids": practice_test_ids,
            "user_ids": user_ids,
            "assignment_type": str(assignment_type or "FULL"),
            "form_type": form_type or "",
            "client_context": client_context,
        }

        snapshot = _actor_snapshot(
            request.user,
            subject=(getattr(request.user, "subject", None) or ""),
        )

        new_dispatch = BulkAssignmentDispatch.objects.create(
            assigned_by=request.user,
            kind=infer_dispatch_kind(exam_ids, practice_test_ids),
            subject_summary="",
            students_requested_count=0,
            students_granted_count=0,
            status=BulkAssignmentDispatch.STATUS_PROCESSING,
            payload=payload,
            result={},
            rerun_of=dispatch,
            actor_snapshot=snapshot,
        )

        try:
            with transaction.atomic():
                result = execute_library_bulk_assign(
                    actor=request.user,
                    exam_ids=exam_ids,
                    practice_test_ids=practice_test_ids,
                    user_ids=user_ids,
                    assignment_type=str(assignment_type or "FULL"),
                    form_type=form_type,
                )
        except Exception as exc:  # defensive: persist failure outcome
            new_dispatch.status = BulkAssignmentDispatch.STATUS_FAILED
            new_dispatch.result = {
                "error": exc.__class__.__name__,
                "detail": str(exc),
            }
            new_dispatch.save(update_fields=["status", "result"])
            raise

        new_dispatch.subject_summary = subject_summary_from_subjects(result.get("subjects_touched") or [])
        new_dispatch.students_requested_count = int(result.get("students_requested_count") or 0)
        new_dispatch.students_granted_count = int(result.get("students_granted_count") or 0)
        new_dispatch.status = BulkAssignmentDispatch.STATUS_COMPLETED
        new_dispatch.result = result
        new_dispatch.save(
            update_fields=[
                "subject_summary",
                "students_requested_count",
                "students_granted_count",
                "status",
                "result",
            ]
        )

        return Response(
            {
                **result,
                "dispatch_id": new_dispatch.pk,
                "dispatch_status": new_dispatch.status,
                "rerun_of_id": dispatch.pk,
            }
        )
