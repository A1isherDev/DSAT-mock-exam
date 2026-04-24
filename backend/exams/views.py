from rest_framework import viewsets, status, generics
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import IsAdminUser
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
import logging
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from django.http import HttpResponse
from datetime import timedelta
import hashlib
import json
from django.db.models import Prefetch

from access import constants as acc_const
from access.permissions import CanManageQuestions, RequiresSubmitTest
from access.policies import (
    BulkAssignAccess,
    BulkAssignmentHistoryAccess,
)
from access.services import (
    actor_subject_probe_for_domain_perm,
    authorize,
    bulk_assign_request_platform_subjects,
    can_browse_standalone_practice_library,
    can_manage_questions,
    filter_mock_exams_for_user,
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
from .idempotency import consume_idempotency_key
from .tasks import score_attempt_async
from .metrics import incr as metric_incr, get_counter
from .prometheus import render_exams_prometheus_text
from .attempt_timing import get_active_module_timing
from .engine_integrity import autoheal_attempt_for_runtime

logger = logging.getLogger(__name__)

def _expected_attempt_version(request) -> int | None:
    raw = request.data.get("expected_version_number")
    if raw is None:
        raw = request.headers.get("If-Match")
    if raw is None:
        return None
    try:
        return int(str(raw).strip().strip('"'))
    except (TypeError, ValueError):
        return None


def _version_conflict_response(view, request, *, attempt: TestAttempt) -> Response:
    metric_incr("version_conflict")
    # Always return canonical state so client can resync.
    attempt = TestAttempt.objects.get(pk=attempt.pk)
    return Response(
        {
            "error": "Version conflict.",
            "detail": "Attempt was updated elsewhere; refresh required.",
            "attempt": view.get_serializer(attempt).data,
        },
        status=status.HTTP_409_CONFLICT,
    )

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
        # Authoritative start/resume: entering the runner should immediately be in MODULE_1_ACTIVE
        # for new attempts, or return canonical current state for existing incomplete attempts.
        try:
            with transaction.atomic():
                locked = (
                    TestAttempt.objects.select_for_update()
                    .select_related("practice_test", "current_module")
                    .get(pk=attempt.pk)
                )
                ensure_full_mock_practice_test_modules(locked.practice_test)
                autoheal_attempt_for_runtime(locked)
                locked.start_attempt()
        except Exception:
            # Fall back to legacy behavior: return attempt row as-is.
            pass

        # Re-fetch canonical state for response (start_attempt mutates state/FKs).
        attempt = TestAttempt.objects.select_related("current_module").get(pk=attempt.pk)
        
        AuditLog.objects.create(
            user=request.user,
            action="START_TEST",
            details=f"Started practice test: {test}"
        )
            
        serializer = self.get_serializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def status(self, request, pk=None):
        """
        Canonical attempt state for polling/resume.
        Frontend must render from this payload (includes server_now in serializer).
        """
        attempt = self.get_object()
        serializer = self.get_serializer(attempt)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start the attempt: always starts Module 1 (backend authoritative).
        """
        attempt = self.get_object()
        if attempt.is_completed:
            return Response({"error": "Cannot start a completed attempt."}, status=status.HTTP_400_BAD_REQUEST)

        ensure_full_mock_practice_test_modules(attempt.practice_test)
        m1 = attempt.practice_test.modules.filter(module_order=1).order_by("id").first()
        if not m1:
            return Response({"error": "Module 1 is missing."}, status=status.HTTP_400_BAD_REQUEST)

        def _compute():
            try:
                with transaction.atomic():
                    locked = TestAttempt.objects.select_for_update().get(pk=attempt.pk)
                    autoheal_attempt_for_runtime(locked)
                    locked.start_attempt()
                return Response(self.get_serializer(TestAttempt.objects.get(pk=attempt.pk)).data)
            except Exception as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        idem = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
        return consume_idempotency_key(attempt=attempt, endpoint="start", key=idem, compute=_compute)

        AuditLog.objects.create(
            user=request.user,
            action="START_TEST_ENGINE",
            details=f"Started module 1 of {attempt.practice_test}",
        )
        serializer = self.get_serializer(TestAttempt.objects.get(pk=attempt.pk))
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def start_module(self, request, pk=None):
        attempt = self.get_object()
        module_id = request.data.get('module_id')
        
        # Defensive: ensure full mock sections always have both modules provisioned.
        ensure_full_mock_practice_test_modules(attempt.practice_test)

        module = get_object_or_404(Module, id=module_id, practice_test=attempt.practice_test)
        
        if attempt.is_completed:
            return Response({'error': 'Cannot start module for a completed test'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # If current module is already expired, prevent arbitrary module hopping.
            timing = get_active_module_timing(attempt)
            if timing and timing.is_expired and attempt.current_state in (
                TestAttempt.STATE_MODULE_1_ACTIVE,
                TestAttempt.STATE_MODULE_2_ACTIVE,
            ):
                attempt.is_expired = True  # serializer reads this attribute
                return Response({"error": "Module time expired."}, status=status.HTTP_409_CONFLICT)

            with transaction.atomic():
                locked = (
                    TestAttempt.objects.select_for_update()
                    .select_related("practice_test", "current_module")
                    .get(pk=attempt.pk)
                )
                autoheal_attempt_for_runtime(locked)
                # Legacy endpoint: keep for compatibility, but enforce canonical rules:
                # - module 1 start → start_attempt
                # - module 2 start → only allowed if engine is already MODULE_2_ACTIVE
                if int(getattr(module, "module_order", 0) or 0) == 1:
                    locked.start_attempt()
                else:
                    locked.start_module(module)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        AuditLog.objects.create(
            user=request.user,
            action="START_MODULE",
            details=f"Started module {module.module_order} of {attempt.practice_test}"
        )

        # Re-fetch from DB so the serializer gets a fresh object with all FK relations
        # loaded (current_module_details needs the related Module row).  Without this,
        # the serializer operates on the in-memory mutated object whose FK cache may be
        # stale, returning null or wrong current_module_details to the frontend.
        attempt = TestAttempt.objects.get(pk=attempt.pk)
        serializer = self.get_serializer(attempt)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def submit_module(self, request, pk=None):
        attempt0 = self.get_object()
        idem = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
        expected_v = _expected_attempt_version(request)

        def _compute():
            try:
                with transaction.atomic():
                    # Defensive: ensure full mock sections always have both modules provisioned.
                    ensure_full_mock_practice_test_modules(attempt0.practice_test)
                    
                    # Lock row to prevent race conditions.
                    attempt = (
                        TestAttempt.objects.select_for_update()
                        .select_related("practice_test", "current_module")
                        .get(pk=attempt0.pk)
                    )
                    autoheal_attempt_for_runtime(attempt)

                    if expected_v is not None and int(attempt.version_number or 0) != int(expected_v):
                        logger.warning("[FORENSIC] submit_module_version_conflict attempt_id=%s req_v=%s db_v=%s", attempt.id, expected_v, attempt.version_number)
                        return _version_conflict_response(self, request, attempt=attempt)
                    
                    if not attempt.current_module:
                        logger.error("[FORENSIC] submit_module_no_active_module attempt_id=%s", attempt.id)
                        return Response({'error': 'No active module to submit'}, status=status.HTTP_400_BAD_REQUEST)
                        
                    timing = get_active_module_timing(attempt)
                    expired = bool(timing and timing.is_expired)
                        
                    module_answers = request.data.get('answers', {})
                    flagged = request.data.get('flagged', [])
                    
                    submitting_module_id = attempt.current_module_id

                    # Duplicate submit guard: if this module was already submitted, do not re-run logic.
                    if attempt.completed_modules.filter(pk=submitting_module_id).exists():
                        logger.info("[FORENSIC] submit_module_already_processed attempt_id=%s mod_id=%s", attempt.id, submitting_module_id)
                        metric_incr("submit_duplicate_prevented")
                    else:
                        # Canonical dispatch based on current state.
                        if attempt.current_state == TestAttempt.STATE_MODULE_1_ACTIVE:
                            attempt.submit_module_1(module_answers, flagged)
                        elif attempt.current_state == TestAttempt.STATE_MODULE_2_ACTIVE:
                            attempt.submit_module_2(module_answers, flagged)
                        else:
                            raise DRFValidationError(f"Cannot submit from state {attempt.current_state}")

                    # After transition, if state is now SCORING, enqueue task.
                    if attempt.current_state == TestAttempt.STATE_SCORING:
                        if attempt.current_state != TestAttempt.STATE_SCORING:
                            attempt.enter_scoring()
                        
                        broker = str(getattr(settings, "CELERY_BROKER_URL", "") or "").strip()
                        eager = bool(getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False))
                        if broker or eager:
                            score_attempt_async.delay(attempt.pk)
                        else:
                            if bool(getattr(settings, "EXAMS_SCORE_INLINE_IF_NO_CELERY", False)):
                                score_attempt_async(attempt.pk)
                        metric_incr("scoring_enqueued")

                # Re-fetch canonical state after transaction commit for response.
                attempt = TestAttempt.objects.select_related("current_module").prefetch_related("current_module__questions").get(pk=attempt0.pk)
                if expired:
                    attempt.is_expired = True
                
                serializer = self.get_serializer(attempt)
                resp_data = serializer.data
                logger.info(
                    "[FORENSIC] submit_module_response attempt_id=%s state=%s mod=%s v=%s",
                    attempt.id, attempt.current_state, attempt.current_module_id, attempt.version_number
                )
                return Response(resp_data)

            except Exception as e:
                logger.exception("[FORENSIC] submit_module_exception attempt_id=%s error=%s", getattr(attempt0, "id", None), str(e))
                return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return consume_idempotency_key(attempt=attempt0, endpoint="submit_module", key=idem, compute=_compute)


    @action(detail=True, methods=['post'])
    def save_attempt(self, request, pk=None):
        attempt0 = self.get_object()
        idem = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
        expected_v = _expected_attempt_version(request)

        def _compute():
            with transaction.atomic():
                attempt = (
                    TestAttempt.objects.select_for_update()
                    .select_related("current_module")
                    .get(pk=attempt0.pk)
                )
                if not attempt.current_module:
                    return Response({'error': 'No active module to save'}, status=status.HTTP_400_BAD_REQUEST)
                if expected_v is not None and int(attempt.version_number or 0) != int(expected_v):
                    return _version_conflict_response(self, request, attempt=attempt)

                timing = get_active_module_timing(attempt)
                if timing and timing.is_expired:
                    attempt.is_expired = True
                    return Response({"error": "Module time expired."}, status=status.HTTP_409_CONFLICT)

                module_answers = request.data.get('answers', {})
                flagged = request.data.get('flagged', [])

                attempt.module_answers[str(attempt.current_module.id)] = module_answers
                attempt.flagged_questions[str(attempt.current_module.id)] = flagged
                attempt.version_number = int(attempt.version_number or 0) + 1
                attempt.save(update_fields=["module_answers", "flagged_questions", "version_number", "updated_at"])

            return Response({'status': 'saved', 'version_number': attempt.version_number})

        return consume_idempotency_key(attempt=attempt0, endpoint="save_attempt", key=idem, compute=_compute)

    @action(detail=True, methods=['get'], url_path='status')
    def status(self, request, pk=None):
        attempt0 = self.get_object()

        def _compute():
            with transaction.atomic():
                attempt = (
                    TestAttempt.objects.select_for_update()
                    .select_related("practice_test", "current_module")
                    .get(pk=attempt0.pk)
                )
                # Runtime integrity + canonical resume behavior:
                # if legacy rows are NOT_STARTED but should begin at Module 1,
                # normalize them here so the runner can always render immediately.
                autoheal_attempt_for_runtime(attempt)
                attempt.resume_attempt()

            attempt = (
                TestAttempt.objects.select_related("practice_test", "current_module")
                .prefetch_related("practice_test__modules", "current_module__questions")
                .get(pk=attempt0.pk)
            )
            logger.info(
                "[FORENSIC] status_check attempt_id=%s state=%s mod=%s v=%s",
                attempt.id, attempt.current_state, attempt.current_module_id, attempt.version_number
            )
            return Response(self.get_serializer(attempt).data)

        # status is safe to be non-idempotency-keyed; it’s a GET that may normalize legacy state.
        return _compute()

    @action(detail=True, methods=['get'])
    def review(self, request, pk=None):
        attempt = self.get_object()
        if attempt.current_state != TestAttempt.STATE_COMPLETED or not getattr(attempt, "is_completed", False):
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
            if not module:
                continue
            
            for q in module.questions.all():
                total_questions += 1
                ans = answers.get(str(q.id))
                
                is_correct = q.check_answer(ans)
                if ans is not None and str(ans).strip() != "": 
                    total_answered += 1
                    if is_correct:
                        total_correct += 1
                
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

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """
        Final results payload (answers/analytics) only when COMPLETED.
        """
        attempt = self.get_object()
        if attempt.current_state != TestAttempt.STATE_COMPLETED or not attempt.is_completed:
            raise PermissionDenied("Results are available only after the attempt is completed.")
        # Reuse existing review payload shape for now (single source for analytics).
        # Frontend can call /results for gatekeeping without exposing review early.
        return self.review(request, pk=pk)


class ExamsMetricsView(APIView):
    """Operational counters for the exam engine (staff)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(
            {
                "submit_module": get_counter("submit_module"),
                "idempotency_replay": get_counter("idempotency_replay"),
                "submit_duplicate_prevented": get_counter("submit_duplicate_prevented"),
                "version_conflict": get_counter("version_conflict"),
                "scoring_enqueued": get_counter("scoring_enqueued"),
                "scoring_completed": get_counter("scoring_completed"),
            }
        )


class ExamsPrometheusMetricsView(APIView):
    """Prometheus text exposition for exam engine counters (staff endpoint)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        body = render_exams_prometheus_text()
        return HttpResponse(body, content_type="text/plain; version=0.0.4; charset=utf-8")

# ── Admin CRUD Viewsets ───────────────────────────────────────────────────────

class AdminMockExamViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuestions]
    serializer_class = AdminMockExamSerializer

    def get_queryset(self):
        base = MockExam.objects.all().prefetch_related("tests__modules")
        if not can_manage_questions(self.request.user):
            return base.none()
        return base

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

        exam.assigned_users.set(users)
        for test in tests:
            test.assigned_users.set(users)
        portal = PortalMockExam.objects.filter(mock_exam=exam).first()
        if portal:
            portal.assigned_users.set(exam.assigned_users.all())

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
    permission_classes = [IsAuthenticated, CanManageQuestions]
    serializer_class = AdminPastpaperPackSerializer

    def get_queryset(self):
        base = PastpaperPack.objects.all().prefetch_related(
            "sections__modules",
            "sections__assigned_users",
        )
        if not can_manage_questions(self.request.user):
            return base.none()
        return base.order_by("-practice_date", "-id")

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
    permission_classes = [IsAuthenticated, CanManageQuestions]
    serializer_class = AdminPracticeTestSerializer

    def get_queryset(self):
        base = PracticeTest.objects.all().prefetch_related("modules", "assigned_users")
        if not can_manage_questions(self.request.user):
            return base.none()
        standalone = self.request.query_params.get("standalone")
        if standalone in ("1", "true", "yes"):
            return base.filter(mock_exam__isnull=True)
        return base


class AdminModuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageQuestions]
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
    permission_classes = [IsAuthenticated, CanManageQuestions]
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

    def get_queryset(self):
        """
        Defense-in-depth: match list scoping.
        Non-wildcard actors may only view their own dispatches unless they have manage_users.
        """
        user = self.request.user
        qs = BulkAssignmentDispatch.objects.select_related("assigned_by").order_by("-created_at")
        perms = get_effective_permission_codenames(user)
        if acc_const.WILDCARD in perms:
            return qs
        subj = actor_subject_probe_for_domain_perm(user)
        if subj and authorize(user, acc_const.PERM_MANAGE_USERS, subject=subj):
            return qs
        return qs.filter(assigned_by=user)


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
