from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max, Avg, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse

import secrets
from time import monotonic

from django.conf import settings as dj_settings

from access.permissions import CanManageQuestions, CanViewTests, CanEditTests, CanAssignTests
from access.services import is_global_scope_staff, user_domain_subject, normalized_role
from access import constants as acc_const
from users.permissions import IsAuthenticatedAndNotFrozen

from classes.models import Assignment, Classroom, ClassroomMembership
from classes.security import classroom_authz_for_user

from .grading import grade_answer
from .models import (
    AssessmentSet,
    AssessmentQuestion,
    HomeworkAssignment,
    AssessmentAttempt,
    AssessmentAnswer,
    AssessmentResult,
    AssessmentAttemptAuditEvent,
)
from .throttles import (
    AssessmentAnswerPerAttemptThrottle,
    AssessmentAssignHomeworkGlobalThrottle,
    AssessmentAssignHomeworkPerClassroomThrottle,
    AssessmentAssignHomeworkThrottle,
)
from .async_tasks import grade_attempt_task
from .grading_service import grade_attempt
from .prometheus import render_assessments_prometheus_text
from .prometheus_homework import render_assessments_homework_prometheus_text
from .metrics import incr as assessments_metric_incr
from core.metrics import incr as metric_incr, incr_role as metric_incr_role
from config.error_reporting import report_error
from .worker_metrics import get_celery_worker_snapshot
from .redis_health import get_redis_health_snapshot
from .serializers import (
    AssessmentSetSerializer,
    AssessmentSetAdminWriteSerializer,
    AssessmentQuestionAdminWriteSerializer,
    AssignHomeworkSerializer,
    HomeworkAssignmentSerializer,
    StartAttemptSerializer,
    SaveAnswerSerializer,
    SubmitAttemptSerializer,
    AttemptSerializer,
    ResultSerializer,
    AssessmentSetSerializer,
    AssessmentQuestionSerializer,
)


class AdminAssessmentSetListCreateView(APIView):
    # Default; method-specific permissions are enforced in get_permissions().
    permission_classes = [IsAuthenticatedAndNotFrozen]

    def get_permissions(self):
        if (self.request.method or "GET").upper() == "GET":
            return [p() for p in (IsAuthenticatedAndNotFrozen, CanViewTests)]
        return [p() for p in (IsAuthenticatedAndNotFrozen, CanEditTests)]

    def get(self, request):
        subject = (request.query_params.get("subject") or "").strip().lower()
        category = (request.query_params.get("category") or "").strip()
        qs = AssessmentSet.objects.all().prefetch_related("questions")

        # Subject scoping:
        # - teachers: forced to their own domain subject (ignore query param)
        # - admin/test_admin/super_admin: may see all subjects; optional filter via query param
        actor = request.user
        if not is_global_scope_staff(actor) and not getattr(actor, "is_superuser", False):
            ds = user_domain_subject(actor)
            if ds in (acc_const.DOMAIN_MATH, acc_const.DOMAIN_ENGLISH):
                qs = qs.filter(subject=ds)
        else:
            if subject in (acc_const.DOMAIN_MATH, acc_const.DOMAIN_ENGLISH):
                qs = qs.filter(subject=subject)

        if category:
            qs = qs.filter(category__iexact=category)
        qs = qs.order_by("-created_at", "-id")[:500]
        return Response(AssessmentSetSerializer(qs, many=True).data)

    def post(self, request):
        s = AssessmentSetAdminWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        inst = s.save(created_by=request.user)
        inst = AssessmentSet.objects.filter(pk=inst.pk).prefetch_related("questions").first()
        return Response(AssessmentSetSerializer(inst).data, status=status.HTTP_201_CREATED)


class AdminGradingMetricsView(APIView):
    """
    DB-derived grading metrics (broker-agnostic):
    - "queue size" approximated by pending submitted attempts
    - latency measured from submitted_at -> result.graded_at
    """

    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def get(self, request):
        now = timezone.now()
        pending = AssessmentAttempt.objects.filter(
            status=AssessmentAttempt.STATUS_SUBMITTED,
            grading_status=AssessmentAttempt.GRADING_PENDING,
        ).count()
        processing = AssessmentAttempt.objects.filter(
            status=AssessmentAttempt.STATUS_SUBMITTED,
            grading_status=AssessmentAttempt.GRADING_PROCESSING,
        ).count()
        failed = AssessmentAttempt.objects.filter(grading_status=AssessmentAttempt.GRADING_FAILED).count()

        # Rolling 24h outcomes
        since = now - timezone.timedelta(hours=24)
        completed_24h = AssessmentAttempt.objects.filter(
            grading_status=AssessmentAttempt.GRADING_COMPLETED,
            grading_last_attempt_at__gte=since,
        ).count()
        failed_24h = AssessmentAttempt.objects.filter(
            grading_status=AssessmentAttempt.GRADING_FAILED,
            grading_last_attempt_at__gte=since,
        ).count()
        retries_24h = (
            AssessmentAttempt.objects.filter(grading_last_attempt_at__gte=since)
            .aggregate(avg_attempts=Avg("grading_attempts"))
            .get("avg_attempts")
        )

        # Latency samples (last 500 results)
        res_qs = (
            AssessmentResult.objects.select_related("attempt")
            .order_by("-graded_at")
            .only("graded_at", "attempt__submitted_at")[:500]
        )
        latencies = []
        for r in res_qs:
            sub = getattr(getattr(r, "attempt", None), "submitted_at", None)
            if sub and r.graded_at:
                latencies.append((r.graded_at - sub).total_seconds())
        latencies.sort()
        def pctl(p: float) -> float | None:
            if not latencies:
                return None
            i = int(round((len(latencies) - 1) * p))
            return float(latencies[max(0, min(len(latencies) - 1, i))])

        # Trend analysis windows
        w5 = now - timezone.timedelta(minutes=5)
        w60 = now - timezone.timedelta(minutes=60)
        submitted_5m = AssessmentAttempt.objects.filter(submitted_at__gte=w5).count()
        graded_5m = AssessmentResult.objects.filter(graded_at__gte=w5).count()
        failed_5m = AssessmentAttempt.objects.filter(grading_status=AssessmentAttempt.GRADING_FAILED, grading_last_attempt_at__gte=w5).count()

        submitted_60m = AssessmentAttempt.objects.filter(submitted_at__gte=w60).count()
        graded_60m = AssessmentResult.objects.filter(graded_at__gte=w60).count()
        failed_60m = AssessmentAttempt.objects.filter(grading_status=AssessmentAttempt.GRADING_FAILED, grading_last_attempt_at__gte=w60).count()

        # Pending age distribution (proxy for queue growth/health).
        pending_rows = list(
            AssessmentAttempt.objects.filter(
                status=AssessmentAttempt.STATUS_SUBMITTED,
                grading_status=AssessmentAttempt.GRADING_PENDING,
            )
            .exclude(submitted_at__isnull=True)
            .values_list("submitted_at", flat=True)[:2000]
        )
        pending_ages = [float((now - t).total_seconds()) for t in pending_rows if t]
        pending_ages.sort()
        def pctl_age(p: float) -> float | None:
            if not pending_ages:
                return None
            i = int(round((len(pending_ages) - 1) * p))
            return float(pending_ages[max(0, min(len(pending_ages) - 1, i))])

        # Broker-aware queue size (optional, Redis only; best-effort).
        broker_url = str(getattr(dj_settings, "CELERY_BROKER_URL", "") or "").strip()
        broker_metrics = {"enabled": False, "transport": None, "queue_len": None, "detail": None}
        if broker_url.lower().startswith("redis"):
            try:
                import redis  # type: ignore

                r = redis.Redis.from_url(broker_url, socket_connect_timeout=0.5, socket_timeout=0.5)
                qname = "celery"
                qlen = int(r.llen(qname))
                broker_metrics = {"enabled": True, "transport": "redis", "queue_len": qlen, "detail": {"queue": qname}}
            except Exception as exc:
                broker_metrics = {"enabled": True, "transport": "redis", "queue_len": None, "detail": str(exc)}

        return Response(
            {
                "queue": {
                    "pending": pending,
                    "processing": processing,
                    "failed_total": failed,
                },
                "rates_24h": {
                    "completed": completed_24h,
                    "failed": failed_24h,
                    "failure_rate": round((failed_24h / (failed_24h + completed_24h)) * 100, 2)
                    if (failed_24h + completed_24h) > 0
                    else 0.0,
                    "avg_grading_attempts": float(retries_24h) if retries_24h is not None else None,
                },
                "latency_seconds": {
                    "p50": pctl(0.50),
                    "p90": pctl(0.90),
                    "p99": pctl(0.99),
                    "sample_n": len(latencies),
                },
                "trend": {
                    "submitted_per_min_5m": round(submitted_5m / 5.0, 2),
                    "graded_per_min_5m": round(graded_5m / 5.0, 2),
                    "failed_per_min_5m": round(failed_5m / 5.0, 2),
                    "submitted_per_min_60m": round(submitted_60m / 60.0, 2),
                    "graded_per_min_60m": round(graded_60m / 60.0, 2),
                    "failed_per_min_60m": round(failed_60m / 60.0, 2),
                    "pending_age_seconds": {
                        "p50": pctl_age(0.50),
                        "p90": pctl_age(0.90),
                        "p99": pctl_age(0.99),
                        "sample_n": len(pending_ages),
                    },
                },
                "broker": broker_metrics,
                "redis": get_redis_health_snapshot(),
                "workers": get_celery_worker_snapshot(),
                "backpressure": {
                    "max_inflight": int(getattr(dj_settings, "ASSESSMENT_GRADING_MAX_INFLIGHT", 500) or 500),
                    "dispatch_batch": int(getattr(dj_settings, "ASSESSMENT_GRADING_DISPATCH_BATCH", 50) or 50),
                },
                "server_time": now.isoformat(),
            }
        )


class AdminAssessmentSetDetailView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]

    def get_permissions(self):
        if (self.request.method or "GET").upper() == "GET":
            return [p() for p in (IsAuthenticatedAndNotFrozen, CanViewTests)]
        return [p() for p in (IsAuthenticatedAndNotFrozen, CanEditTests)]

    def get(self, request, pk: int):
        inst = get_object_or_404(AssessmentSet.objects.prefetch_related("questions"), pk=pk)
        # Teacher scoping defense-in-depth (detail endpoints).
        actor = request.user
        if not is_global_scope_staff(actor) and not getattr(actor, "is_superuser", False):
            ds = user_domain_subject(actor)
            if ds and inst.subject != ds:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AssessmentSetSerializer(inst).data)

    def patch(self, request, pk: int):
        inst = get_object_or_404(AssessmentSet, pk=pk)
        actor = request.user
        if not is_global_scope_staff(actor) and not getattr(actor, "is_superuser", False):
            ds = user_domain_subject(actor)
            if ds and inst.subject != ds:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        s = AssessmentSetAdminWriteSerializer(inst, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        inst = s.save()
        inst = AssessmentSet.objects.filter(pk=inst.pk).prefetch_related("questions").first()
        return Response(AssessmentSetSerializer(inst).data)

    def delete(self, request, pk: int):
        inst = get_object_or_404(AssessmentSet, pk=pk)
        actor = request.user
        if not is_global_scope_staff(actor) and not getattr(actor, "is_superuser", False):
            ds = user_domain_subject(actor)
            if ds and inst.subject != ds:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        inst.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminAssessmentQuestionCreateView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen, CanEditTests]

    def post(self, request, set_pk: int):
        aset = get_object_or_404(AssessmentSet, pk=set_pk)
        s = AssessmentQuestionAdminWriteSerializer(data={**request.data, "assessment_set": aset.pk})
        s.is_valid(raise_exception=True)
        # Default append order if not specified.
        if "order" not in s.validated_data:
            mx = (
                AssessmentQuestion.objects.filter(assessment_set=aset).aggregate(Max("order")).get("order__max")
                or 0
            )
            s.validated_data["order"] = int(mx) + 1
        q = s.save(assessment_set=aset)
        return Response(AssessmentQuestionAdminWriteSerializer(q).data, status=status.HTTP_201_CREATED)


class AdminAssessmentQuestionDetailView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen, CanEditTests]

    def patch(self, request, pk: int):
        q = get_object_or_404(AssessmentQuestion, pk=pk)
        s = AssessmentQuestionAdminWriteSerializer(q, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        q = s.save()
        return Response(AssessmentQuestionAdminWriteSerializer(q).data)

    def delete(self, request, pk: int):
        q = get_object_or_404(AssessmentQuestion, pk=pk)
        q.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssignAssessmentHomeworkView(APIView):
    """
    Teacher assigns an AssessmentSet into a classroom.
    Creates a linked `classes.Assignment` so it appears in the normal homework feed.
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]
    throttle_classes = [
        AssessmentAssignHomeworkThrottle,
        AssessmentAssignHomeworkPerClassroomThrottle,
        AssessmentAssignHomeworkGlobalThrottle,
    ]

    def post(self, request):
        t0 = monotonic()
        ser = AssignHomeworkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        from .mitigation import is_global_assignment_blocked, is_user_assignment_blocked

        if is_global_assignment_blocked():
            metric_incr("slo_homework_assign_fail_total")
            metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
            return Response(
                {"detail": "Assignment temporarily rate-limited system-wide. Retry shortly."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if is_user_assignment_blocked(request.user.pk):
            metric_incr("slo_homework_assign_fail_total")
            metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
            return Response(
                {"detail": "Your account is temporarily blocked from assigning tests due to abuse controls."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        classroom = get_object_or_404(Classroom, pk=data["classroom_id"])
        c_authz = classroom_authz_for_user(classroom=classroom, user=request.user)
        if not c_authz.is_class_admin:
            metric_incr("slo_homework_assign_fail_total")
            metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
            return Response({"detail": "Only class admins can assign homework."}, status=status.HTTP_403_FORBIDDEN)

        aset = get_object_or_404(AssessmentSet.objects.prefetch_related("questions"), pk=data["set_id"])

        # Assignment permission gate (backend-enforced; never rely on frontend filtering):
        # - must have can_assign_tests in the actor context
        # - teachers must "own" the classroom (classroom.teacher == actor)
        actor = request.user
        if not CanAssignTests().has_permission(request, self):
            metric_incr("slo_homework_assign_fail_total")
            metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
            return Response({"detail": "You do not have permission to assign tests."}, status=status.HTTP_403_FORBIDDEN)

        role = normalized_role(actor)
        if role == acc_const.ROLE_TEACHER:
            # Classroom ownership: teacher can only assign within classes they teach.
            if not c_authz.is_teacher_owner:
                metric_incr("slo_homework_assign_fail_total")
                metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
                return Response({"detail": "Only the classroom teacher can assign tests in this class."}, status=status.HTTP_403_FORBIDDEN)
            # Subject scope: teachers can only assign their own subject.
            ds = user_domain_subject(actor)
            if ds and aset.subject != ds:
                metric_incr("slo_homework_assign_fail_total")
                metric_incr_role("slo_homework_assign_fail_total", actor=getattr(request, "user", None))
                return Response({"detail": "You cannot assign tests outside your subject."}, status=status.HTTP_403_FORBIDDEN)

        title = (data.get("title") or "").strip() or aset.title
        instructions = (data.get("instructions") or "").strip()
        due_at = data.get("due_at")

        # Create core homework row in existing system (atomic + idempotent).
        # DB uniqueness on (classroom, assessment_set) makes retries safe.
        with transaction.atomic():
            existing = (
                HomeworkAssignment.objects.select_for_update()
                .select_related("assignment")
                .filter(classroom=classroom, assessment_set=aset)
                .order_by("-id")
                .first()
            )
            if existing:
                assessments_metric_incr("homework_duplicate_prevented")
                hw = existing
            else:
                assignment = Assignment.objects.create(
                    classroom=classroom,
                    created_by=request.user,
                    title=title[:200],
                    instructions=instructions,
                    due_at=due_at,
                )
                try:
                    hw = HomeworkAssignment.objects.create(
                        classroom=classroom,
                        assessment_set=aset,
                        assignment=assignment,
                        assigned_by=request.user,
                    )
                except IntegrityError:
                    assessments_metric_incr("homework_duplicate_prevented")
                    # Another request created the homework concurrently.
                    # Clean up the now-orphaned assignment and return canonical homework.
                    assignment.delete()
                    hw = (
                        HomeworkAssignment.objects.select_for_update()
                        .select_related("assignment")
                        .filter(classroom=classroom, assessment_set=aset)
                        .order_by("-id")
                        .first()
                    )
                    if not hw:
                        report_error(
                            "assessments.homework_assign_integrity_error_no_canonical",
                            context={"actor_id": request.user.pk, "classroom_id": classroom.pk, "set_id": aset.pk},
                        )
                        raise
        from .models import AssessmentHomeworkAuditEvent

        AssessmentHomeworkAuditEvent.objects.create(
            classroom=classroom,
            assessment_set=aset,
            homework=hw,
            actor=request.user,
            event_type=AssessmentHomeworkAuditEvent.EVENT_ASSIGNED,
            payload={"host": request.get_host(), "title": title},
        )

        from .homework_abuse import evaluate_abuse_after_assignment

        evaluate_abuse_after_assignment(
            actor_id=request.user.pk,
            classroom_id=classroom.pk,
            actor_role=normalized_role(request.user),
            actor_is_global_staff=is_global_scope_staff(request.user) or bool(getattr(request.user, "is_superuser", False)),
        )

        metric_incr("slo_homework_assign_ok_total")
        metric_incr_role("slo_homework_assign_ok_total", actor=getattr(request, "user", None))
        metric_incr("slo_homework_assign_latency_ms_sum", int((monotonic() - t0) * 1000))
        metric_incr("slo_homework_assign_latency_ms_count")
        return Response(HomeworkAssignmentSerializer(hw, context={"request": request}).data, status=status.HTTP_201_CREATED)


def _audit_attempt(attempt: AssessmentAttempt, *, actor, event_type: str, payload: dict | None = None) -> None:
    AssessmentAttemptAuditEvent.objects.create(
        attempt=attempt,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        event_type=event_type,
        payload=payload or {},
    )


class StartAttemptView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]

    @transaction.atomic
    def post(self, request):
        ser = StartAttemptSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        assignment_id = int(ser.validated_data["assignment_id"])

        hw = HomeworkAssignment.objects.select_related("assignment", "classroom", "assessment_set").filter(
            assignment_id=assignment_id
        ).first()
        if not hw:
            return Response({"detail": "Assessment homework not found."}, status=status.HTTP_404_NOT_FOUND)

        classroom = hw.classroom
        if not classroom.memberships.filter(user=request.user, role=ClassroomMembership.ROLE_STUDENT).exists():
            return Response({"detail": "Only students can start this assessment."}, status=status.HTTP_403_FORBIDDEN)

        # Reuse in-progress attempt if exists.
        att = (
            AssessmentAttempt.objects.select_for_update()
            .filter(homework=hw, student=request.user, status=AssessmentAttempt.STATUS_IN_PROGRESS)
            .order_by("-started_at", "-id")
            .first()
        )
        if not att:
            att = AssessmentAttempt.objects.create(
                homework=hw,
                student=request.user,
                last_activity_at=timezone.now(),
                grading_status=AssessmentAttempt.GRADING_PENDING,
            )
            # Shuffle question order once, per attempt.
            qids = list(
                AssessmentQuestion.objects.filter(
                    assessment_set=hw.assessment_set,
                    is_active=True,
                )
                .order_by("order", "id")
                .values_list("id", flat=True)
            )
            secrets.SystemRandom().shuffle(qids)
            att.question_order = qids
            att.save(update_fields=["question_order"])
            _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_STARTED, payload={"question_count": len(qids)})
        else:
            if not att.last_activity_at:
                att.last_activity_at = timezone.now()
                att.save(update_fields=["last_activity_at"])

        att = AssessmentAttempt.objects.filter(pk=att.pk).prefetch_related("answers").first()
        return Response(AttemptSerializer(att).data, status=status.HTTP_200_OK)


class AttemptBundleView(APIView):
    """
    Student-facing attempt bootstrap: return attempt + sanitized question list
    (no correct answers), ordered by the per-attempt shuffle.
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]

    def get(self, request, attempt_id: int):
        att = AssessmentAttempt.objects.select_related("homework__classroom", "homework__assessment_set").filter(
            pk=attempt_id, student=request.user
        ).first()
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        hw = att.homework
        if not hw.classroom.memberships.filter(user=request.user, role=ClassroomMembership.ROLE_STUDENT).exists():
            return Response({"detail": "Only students can view this attempt."}, status=status.HTTP_403_FORBIDDEN)

        aset = hw.assessment_set
        base_questions = list(
            AssessmentQuestion.objects.filter(assessment_set=aset, is_active=True).order_by("order", "id")
        )
        q_by_id = {q.id: q for q in base_questions}
        order_ids = [int(x) for x in (att.question_order or []) if isinstance(x, (int, str)) and str(x).isdigit()]
        questions = [q_by_id[qid] for qid in order_ids if qid in q_by_id] if order_ids else base_questions

        att = AssessmentAttempt.objects.filter(pk=att.pk).prefetch_related("answers").first()
        return Response(
            {
                "attempt": AttemptSerializer(att).data,
                "set": AssessmentSetSerializer(aset).data,
                "questions": AssessmentQuestionSerializer(questions, many=True).data,
            }
        )


class SaveAnswerView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]
    throttle_classes = [AssessmentAnswerPerAttemptThrottle]

    @transaction.atomic
    def post(self, request):
        ser = SaveAnswerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        client_seq = int(data.get("client_seq") or 0)

        att = AssessmentAttempt.objects.select_for_update().select_related("homework").filter(
            pk=data["attempt_id"], student=request.user
        ).first()
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        if att.status != AssessmentAttempt.STATUS_IN_PROGRESS:
            return Response({"detail": f"Attempt is locked ({att.lock_reason()})."}, status=status.HTTP_400_BAD_REQUEST)
        # Max lifetime gate (server-side).
        max_life = int(getattr(dj_settings, "ASSESSMENT_MAX_ATTEMPT_LIFETIME_SECONDS", 6 * 60 * 60) or 0)
        if max_life > 0 and att.started_at and (timezone.now() - att.started_at).total_seconds() > max_life:
            now = timezone.now()
            att.status = AssessmentAttempt.STATUS_ABANDONED
            att.abandoned_at = now
            att.last_activity_at = now
            att.save(update_fields=["status", "abandoned_at", "last_activity_at"])
            _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_TIMEOUT_ABANDONED, payload={"reason": "max_lifetime"})
            return Response({"detail": "Attempt expired."}, status=status.HTTP_410_GONE)

        q = AssessmentQuestion.objects.filter(pk=data["question_id"], assessment_set=att.homework.assessment_set).first()
        if not q:
            return Response({"detail": "Question not found for this attempt."}, status=status.HTTP_404_NOT_FOUND)

        ans = data.get("answer", None)
        now = timezone.now()
        answered_at = now

        # Ensure the question is part of the shuffled attempt order (defense-in-depth).
        order_ids = set((att.question_order or []) or [])
        if order_ids and q.id not in order_ids:
            return Response({"detail": "Question is not part of this attempt."}, status=status.HTTP_400_BAD_REQUEST)

        row, created = AssessmentAnswer.objects.select_for_update().get_or_create(
            attempt=att,
            question=q,
            defaults={
                "answer": ans,
                "answered_at": answered_at,
                "first_seen_at": now,
                "last_seen_at": now,
                "time_spent_seconds": 0,
                "client_seq": client_seq,
            },
        )
        if not created:
            # Optimistic concurrency: reject stale/out-of-order writes (multi-tab, mobile retries).
            if client_seq and int(getattr(row, "client_seq", 0) or 0) >= client_seq:
                return Response(
                    {
                        "detail": "Stale answer update rejected.",
                        "code": "stale_write",
                        "server_client_seq": int(getattr(row, "client_seq", 0) or 0),
                        "answer_id": row.pk,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            row.answer = ans
            row.answered_at = answered_at
            if row.first_seen_at is None:
                row.first_seen_at = now
            row.last_seen_at = now
            row.client_seq = max(int(getattr(row, "client_seq", 0) or 0), int(client_seq or 0))
            # Compute time from server timestamps. Cap per-question time to avoid runaway.
            cap = int((q.grading_config or {}).get("max_seconds") or 15 * 60)
            cap = max(10, min(2 * 60 * 60, cap))
            delta = int((row.last_seen_at - row.first_seen_at).total_seconds()) if row.last_seen_at and row.first_seen_at else 0
            row.time_spent_seconds = max(0, min(cap, delta))
            row.save(
                update_fields=[
                    "answer",
                    "answered_at",
                    "first_seen_at",
                    "last_seen_at",
                    "time_spent_seconds",
                    "client_seq",
                    "updated_at",
                ]
            )

        # Active time accumulation: count time between server-observed events, ignore idle gaps.
        idle_threshold = int(getattr(dj_settings, "ASSESSMENT_ACTIVE_IDLE_THRESHOLD_SECONDS", 90) or 90)
        slice_cap = int(getattr(dj_settings, "ASSESSMENT_ACTIVE_SLICE_CAP_SECONDS", 45) or 45)
        idle_threshold = max(10, min(15 * 60, idle_threshold))
        slice_cap = max(1, min(idle_threshold, slice_cap))
        prev = att.last_activity_at or att.started_at
        delta = int((now - prev).total_seconds()) if prev else 0
        add = 0
        if 0 < delta <= idle_threshold:
            add = min(slice_cap, delta)
        att.active_time_seconds = int(att.active_time_seconds or 0) + int(add)
        att.last_activity_at = now
        att.save(update_fields=["last_activity_at", "active_time_seconds"])
        _audit_attempt(
            att,
            actor=request.user,
            event_type=AssessmentAttemptAuditEvent.EVENT_ANSWER_SAVED,
            payload={"question_id": q.id, "answer_present": ans is not None},
        )
        return Response({"answer_id": row.pk}, status=status.HTTP_200_OK)


class SubmitAttemptView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]

    @transaction.atomic
    def post(self, request):
        ser = SubmitAttemptSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        attempt_id = int(ser.validated_data["attempt_id"])

        att = (
            AssessmentAttempt.objects.select_for_update()
            .select_related("homework", "homework__assessment_set", "homework__assignment", "homework__classroom")
            .filter(pk=attempt_id, student=request.user)
            .first()
        )
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        if att.status in (AssessmentAttempt.STATUS_SUBMITTED, AssessmentAttempt.STATUS_GRADED):
            res = AssessmentResult.objects.filter(attempt=att).first()
            return Response(
                {"attempt": AttemptSerializer(att).data, "result": ResultSerializer(res).data if res else None}
            )
        if att.status == AssessmentAttempt.STATUS_ABANDONED:
            return Response({"detail": "Attempt is abandoned."}, status=status.HTTP_400_BAD_REQUEST)
        # Max lifetime gate.
        max_life = int(getattr(dj_settings, "ASSESSMENT_MAX_ATTEMPT_LIFETIME_SECONDS", 6 * 60 * 60) or 0)
        if max_life > 0 and att.started_at and (timezone.now() - att.started_at).total_seconds() > max_life:
            return Response({"detail": "Attempt expired."}, status=status.HTTP_410_GONE)

        aset = att.homework.assessment_set
        base_questions = list(
            AssessmentQuestion.objects.filter(assessment_set=aset, is_active=True).order_by("order", "id")
        )
        q_by_id = {q.id: q for q in base_questions}
        # Validate assessment version: if question snapshot doesn't match active questions, force restart.
        active_now = set(q_by_id.keys())
        snap = set(int(x) for x in (att.question_order or []) if str(x).isdigit())
        if snap and snap != active_now:
            return Response(
                {"detail": "This assessment was updated. Please restart the attempt."},
                status=status.HTTP_409_CONFLICT,
            )

        # Use per-attempt shuffle order when present; otherwise fall back to canonical order.
        order_ids = [int(x) for x in (att.question_order or []) if isinstance(x, (int, str)) and str(x).isdigit()]
        questions = [q_by_id[qid] for qid in order_ids if qid in q_by_id] if order_ids else base_questions

        answers = {
            a.question_id: a
            for a in AssessmentAnswer.objects.filter(attempt=att, question_id__in=q_by_id.keys())
        }

        max_points = Decimal("0")
        score = Decimal("0")
        correct = 0
        total_time = 0

        # Completeness: treat unanswered as wrong (still valid), but optionally enforce answered-for-all.
        missing = [q.id for q in questions if q.id not in answers]
        enforce = str(getattr(dj_settings, "ASSESSMENT_ENFORCE_COMPLETENESS", "False")).lower() in ("1", "true", "yes")
        if enforce and missing:
            return Response(
                {"detail": "Please answer all questions before submitting.", "missing_question_ids": missing[:50]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for q in questions:
            max_points += Decimal(str(q.points or 0))
            a = answers.get(q.id)
            total_time += int(getattr(a, "time_spent_seconds", 0) or 0)
            ok = False
            if a is not None:
                ok = grade_answer(
                    question_type=q.question_type,
                    correct_answer=q.correct_answer,
                    answer=a.answer,
                    config=q.grading_config or {},
                )
                a.is_correct = ok
                a.points_awarded = Decimal(str(q.points or 0)) if ok else Decimal("0")
                a.save(update_fields=["is_correct", "points_awarded", "updated_at"])
            if ok:
                correct += 1
                score += Decimal(str(q.points or 0))

        now = timezone.now()
        # Mark submitted first (locks the attempt). Grading is synchronous, then we promote to graded.
        att.status = AssessmentAttempt.STATUS_SUBMITTED
        att.submitted_at = now
        att.last_activity_at = now
        # Harden total time: derive primarily from server attempt span, not per-answer time.
        span = int((now - att.started_at).total_seconds()) if att.started_at else 0
        span_cap = 6 * 60 * 60  # 6h safety cap
        span = max(0, min(span_cap, span))
        # Use span as truth source; keep per-question sum only as a lower bound signal.
        att.total_time_seconds = max(span, min(span_cap, total_time))
        # Active time: also consider the final slice since last activity.
        prev = att.last_activity_at or att.started_at
        if prev and prev < now:
            idle_threshold = int(getattr(dj_settings, "ASSESSMENT_ACTIVE_IDLE_THRESHOLD_SECONDS", 90) or 90)
            slice_cap = int(getattr(dj_settings, "ASSESSMENT_ACTIVE_SLICE_CAP_SECONDS", 45) or 45)
            delta = int((now - prev).total_seconds())
            if 0 < delta <= max(10, idle_threshold):
                att.active_time_seconds = int(att.active_time_seconds or 0) + int(min(slice_cap, delta))
        att.save(update_fields=["status", "submitted_at", "total_time_seconds", "last_activity_at"])
        _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_SUBMITTED, payload={"total_time_seconds": att.total_time_seconds})

        total_q = len(questions)
        percent = Decimal("0")
        if max_points > 0:
            percent = (score / max_points) * Decimal("100")

        # Async grading toggle: if Celery is configured (or eager), enqueue grading work.
        broker = str(getattr(dj_settings, "CELERY_BROKER_URL", "") or "").strip()
        eager = bool(getattr(dj_settings, "CELERY_TASK_ALWAYS_EAGER", False))
        use_async = bool(broker) or eager

        if use_async:
            att.grading_status = AssessmentAttempt.GRADING_PENDING
            att.grading_error = ""
            att.save(update_fields=["grading_status", "grading_error"])
            grade_attempt_task.delay(att.pk)
            return Response(
                {"attempt": AttemptSerializer(att).data, "result": None, "grading": "queued"},
                status=status.HTTP_202_ACCEPTED,
            )

        # Fallback: grade inline (same idempotent service as async).
        res = grade_attempt(attempt_id=att.pk)
        att.refresh_from_db()
        return Response({"attempt": AttemptSerializer(att).data, "result": ResultSerializer(res).data if res else None})


class AbandonAttemptView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]

    @transaction.atomic
    def post(self, request):
        attempt_id = int((request.data or {}).get("attempt_id") or 0)
        if not attempt_id:
            return Response({"detail": "attempt_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        att = (
            AssessmentAttempt.objects.select_for_update()
            .filter(pk=attempt_id, student=request.user)
            .first()
        )
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        if att.status != AssessmentAttempt.STATUS_IN_PROGRESS:
            return Response({"detail": f"Attempt cannot be abandoned from {att.status}."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        att.status = AssessmentAttempt.STATUS_ABANDONED
        att.abandoned_at = now
        att.last_activity_at = now
        att.save(update_fields=["status", "abandoned_at", "last_activity_at"])
        _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_ABANDONED, payload={})
        return Response({"attempt": AttemptSerializer(att).data}, status=status.HTTP_200_OK)


class AdminAttemptStatusView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def get(self, request, attempt_id: int):
        att = (
            AssessmentAttempt.objects.select_related("homework", "homework__assessment_set")
            .prefetch_related("answers", "audit_events")
            .filter(pk=attempt_id)
            .first()
        )
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        res = AssessmentResult.objects.filter(attempt=att).first()
        return Response({"attempt": AttemptSerializer(att).data, "result": ResultSerializer(res).data if res else None})


class AdminRequeueAttemptView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    @transaction.atomic
    def post(self, request, attempt_id: int):
        att = AssessmentAttempt.objects.select_for_update().filter(pk=attempt_id).first()
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        if att.status != AssessmentAttempt.STATUS_SUBMITTED:
            return Response({"detail": "Only submitted attempts can be requeued."}, status=status.HTTP_400_BAD_REQUEST)
        if att.grading_status != AssessmentAttempt.GRADING_FAILED:
            return Response({"detail": "Only failed attempts can be requeued."}, status=status.HTTP_400_BAD_REQUEST)
        cooldown = int(getattr(dj_settings, "ASSESSMENT_ADMIN_REQUEUE_COOLDOWN_SECONDS", 60) or 60)
        max_requeues = int(getattr(dj_settings, "ASSESSMENT_ADMIN_REQUEUE_MAX_PER_ATTEMPT", 6) or 6)
        cooldown = max(5, min(3600, cooldown))
        max_requeues = max(1, min(50, max_requeues))
        if att.grading_attempts >= max_requeues:
            return Response({"detail": "Requeue limit reached for this attempt."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if att.grading_last_attempt_at and (timezone.now() - att.grading_last_attempt_at).total_seconds() < cooldown:
            return Response({"detail": "Requeue cooldown active."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        att.grading_status = AssessmentAttempt.GRADING_PENDING
        att.grading_error = ""
        att.save(update_fields=["grading_status", "grading_error"])
        grade_attempt_task.delay(att.pk)
        _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_SUBMITTED, payload={"admin_requeue": True})
        return Response({"detail": "Requeued.", "attempt": AttemptSerializer(att).data}, status=status.HTTP_200_OK)


class AdminForceGradeAttemptView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def post(self, request, attempt_id: int):
        confirm = str((request.data or {}).get("confirm") or "").strip().upper()
        if confirm not in ("FORCE", "YES"):
            return Response(
                {"detail": "Confirmation required. Send { confirm: 'FORCE' } to force grading."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        res = grade_attempt(attempt_id=int(attempt_id))
        att = AssessmentAttempt.objects.filter(pk=attempt_id).first()
        if not att:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        _audit_attempt(att, actor=request.user, event_type=AssessmentAttemptAuditEvent.EVENT_GRADED, payload={"admin_force": True})
        return Response({"attempt": AttemptSerializer(att).data, "result": ResultSerializer(res).data if res else None}, status=status.HTTP_200_OK)


class AdminGradingPrometheusMetricsView(APIView):
    """
    Prometheus scrape endpoint for grading/worker gauges.
    Keep it dependency-free (mirrors realtime.prometheus pattern).
    """

    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def get(self, request):
        txt = render_assessments_prometheus_text()
        return HttpResponse(txt, content_type="text/plain; version=0.0.4")


class AdminHomeworkPrometheusMetricsView(APIView):
    """
    Prometheus scrape endpoint for homework integrity counters.
    Keep it dependency-free (mirrors other prometheus endpoints).
    """

    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def get(self, request):
        txt = render_assessments_homework_prometheus_text()
        return HttpResponse(txt, content_type="text/plain; version=0.0.4")


class AdminBuilderTelemetryView(APIView):
    """
    Minimal telemetry ingestion endpoint for questions-console builder recovery events.
    Best-effort counters only (Prometheus-exposed via assessments homework metrics endpoint).
    """

    permission_classes = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

    def post(self, request):
        key = str((request.data or {}).get("key") or "").strip()
        allowed = {
            "invalid_selection_recovered_total",
            "stale_id_blocked_total",
            "builder_refetch_recovery_total",
        }
        if key not in allowed:
            return Response({"detail": "Invalid telemetry key."}, status=status.HTTP_400_BAD_REQUEST)
        assessments_metric_incr(key)
        return Response({"ok": True}, status=status.HTTP_200_OK)


class MyAssessmentResultForAssignmentView(APIView):
    """
    Convenience endpoint for the homework page: given a class assignment id, return the
    student's latest attempt/result for that assessment homework.
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]

    def get(self, request, assignment_id: int):
        hw = HomeworkAssignment.objects.select_related("assessment_set", "assignment", "classroom").filter(
            assignment_id=assignment_id
        ).first()
        if not hw:
            return Response({"detail": "Assessment homework not found."}, status=status.HTTP_404_NOT_FOUND)
        if not hw.classroom.memberships.filter(user=request.user, role=ClassroomMembership.ROLE_STUDENT).exists():
            return Response({"detail": "Only students can view this result."}, status=status.HTTP_403_FORBIDDEN)
        att = (
            AssessmentAttempt.objects.filter(homework=hw, student=request.user)
            .order_by("-started_at", "-id")
            .first()
        )
        if not att:
            return Response({"attempt": None, "result": None})
        res = AssessmentResult.objects.filter(attempt=att).first()
        return Response({"attempt": AttemptSerializer(att).data, "result": ResultSerializer(res).data if res else None})

