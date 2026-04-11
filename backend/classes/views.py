from collections import defaultdict
from statistics import mean

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from access import constants as acc_const
from access.services import authorize

from exams.models import PracticeTest, TestAttempt
from users.permissions import IsAuthenticatedAndNotFrozen

from .models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    AssignmentExtraAttachment,
    Submission,
    Grade,
    assignment_target_practice_test_ids,
)
from .permissions import IsClassAdmin, IsClassMember
from .serializers import (
    ClassroomSerializer,
    ClassroomCreateSerializer,
    ClassroomMembershipSerializer,
    ClassPostSerializer,
    AssignmentSerializer,
    SubmissionSerializer,
    SubmitSerializer,
    GradeUpsertSerializer,
)


class ClassroomViewSet(ModelViewSet):
    """
    - List: classes the current user is a member of
    - Create: admin only (creates admin membership for creator)
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]
    queryset = Classroom.objects.all()

    def get_queryset(self):
        user = self.request.user
        return (
            Classroom.objects.filter(memberships__user=user)
            .annotate(members_count=Count("memberships"))
            .distinct()
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClassroomCreateSerializer
        return ClassroomSerializer

    def create(self, request, *args, **kwargs):
        # Permission + scope (subject-domain) enforced here.
        subj = (request.data or {}).get("subject")
        platform_subject = (
            acc_const.SUBJECT_MATH_PLATFORM
            if subj == Classroom.SUBJECT_MATH
            else acc_const.SUBJECT_ENGLISH_PLATFORM
            if subj == Classroom.SUBJECT_ENGLISH
            else None
        )
        if not authorize(request.user, acc_const.PERM_CREATE_CLASSROOM, subject=platform_subject):
            return Response(
                {"detail": "You do not have permission to create groups."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        teacher = serializer.validated_data.get("teacher") or request.user
        classroom = serializer.save(created_by=request.user, teacher=teacher)
        ClassroomMembership.objects.get_or_create(
            classroom=classroom, user=request.user, defaults={"role": "ADMIN"}
        )
        ClassroomMembership.objects.get_or_create(
            classroom=classroom, user=teacher, defaults={"role": "ADMIN"}
        )
        out = ClassroomSerializer(classroom, context={"request": request}).data
        return Response(out, status=status.HTTP_201_CREATED)

    def _ensure_class_admin(self, classroom):
        if not classroom.memberships.filter(user=self.request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can edit groups."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def _sync_teacher_membership(self, instance):
        teacher = instance.teacher
        if teacher:
            ClassroomMembership.objects.get_or_create(
                classroom=instance, user=teacher, defaults={"role": "ADMIN"}
            )

    # PATCH calls partial_update → UpdateModelMixin.update(partial=True). Override update only
    # (do not delegate update → partial_update or recursion occurs).
    def update(self, request, *args, **kwargs):
        classroom = self.get_object()
        denied = self._ensure_class_admin(classroom)
        if denied is not None:
            return denied
        response = super().update(request, *args, **kwargs)
        self._sync_teacher_membership(self.get_object())
        return response

    def destroy(self, request, *args, **kwargs):
        classroom = self.get_object()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can delete groups."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedAndNotFrozen])
    def regenerate_code(self, request, pk=None):
        classroom = self.get_object()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        classroom.join_code = ""
        classroom.save(update_fields=["join_code", "updated_at"])
        return Response({"join_code": classroom.join_code})

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticatedAndNotFrozen])
    def people(self, request, pk=None):
        classroom = self.get_object()
        memberships = classroom.memberships.select_related("user").all().order_by("role", "-joined_at")
        return Response(ClassroomMembershipSerializer(memberships, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticatedAndNotFrozen], url_path="assignment-options")
    def assignment_options(self, request, pk=None):
        """
        Mock exams + pastpaper practice tests the teacher may attach to homework (full test only).
        Uses the same visibility rules as /exams/mock-exams/ and /exams/.
        """
        classroom = self.get_object()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response(
                {"detail": "Only class teachers can load assignment options."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from exams.views import MockExamViewSet, PracticeTestViewSet

        mvs = MockExamViewSet()
        mvs.request = request
        mvs.format_kwarg = None
        mock_qs = mvs.get_queryset()

        pvs = PracticeTestViewSet()
        pvs.request = request
        pvs.format_kwarg = None
        pt_qs = pvs.get_queryset().select_related("pastpaper_pack")

        mock_exams = [
            {
                "id": m.id,
                "title": m.title,
                "practice_date": m.practice_date.isoformat() if m.practice_date else None,
                "kind": m.kind,
            }
            for m in mock_qs
        ]

        practice_tests = []
        for pt in pt_qs:
            pack = pt.pastpaper_pack
            practice_tests.append(
                {
                    "id": pt.id,
                    "title": (pt.title or "").strip(),
                    "subject": pt.subject,
                    "label": pt.label or "",
                    "form_type": pt.form_type,
                    "practice_date": pt.practice_date.isoformat() if pt.practice_date else None,
                    "created_at": pt.created_at.isoformat() if pt.created_at else None,
                    "mock_exam": None,
                    "pastpaper_pack_id": pt.pastpaper_pack_id,
                    "pastpaper_pack": (
                        {
                            "id": pack.id,
                            "title": pack.title or "",
                            "practice_date": pack.practice_date.isoformat() if pack.practice_date else None,
                            "label": pack.label or "",
                            "form_type": pack.form_type,
                        }
                        if pack
                        else None
                    ),
                }
            )

        return Response({"mock_exams": mock_exams, "practice_tests": practice_tests})

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticatedAndNotFrozen], url_path="leaderboard")
    def leaderboard(self, request, pk=None):
        """
        Pastpaper / practice-test homework stats: per-assignment group mean, per-student ranks,
        and score on the most recently assigned practice test in this class.
        """
        classroom = self.get_object()
        if not classroom.memberships.filter(user=request.user).exists():
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)

        student_memberships = list(
            classroom.memberships.filter(role=ClassroomMembership.ROLE_STUDENT)
            .select_related("user")
            .order_by("user__first_name", "user__last_name", "user__email")
        )
        student_ids = [m.user_id for m in student_memberships]
        n_students = len(student_ids)

        practice_assignments = list(
            Assignment.objects.filter(classroom=classroom)
            .filter(
                Q(practice_test__isnull=False)
                | Q(pastpaper_pack__isnull=False)
                | Q(practice_test_ids__isnull=False)
                | Q(mock_exam__isnull=False)
            )
            .select_related("practice_test", "pastpaper_pack", "mock_exam")
            .order_by("-created_at")
        )
        assign_ids = [a.id for a in practice_assignments]
        latest_pa = practice_assignments[0] if practice_assignments else None

        scores_by_assignment: dict[int, list[int]] = defaultdict(list)
        sub_map: dict[tuple[int, int], Submission] = {}
        if assign_ids and student_ids:
            subs_qs = Submission.objects.filter(
                assignment_id__in=assign_ids,
                student_id__in=student_ids,
            ).select_related("attempt", "assignment", "assignment__practice_test", "assignment__pastpaper_pack")
            for s in subs_qs:
                sub_map[(s.student_id, s.assignment_id)] = s
                att = s.attempt
                if att and att.is_completed and att.score is not None:
                    targets = assignment_target_practice_test_ids(s.assignment)
                    if att.practice_test_id in targets:
                        scores_by_assignment[s.assignment_id].append(att.score)

        assignments_summary = []
        for a in practice_assignments:
            scores = scores_by_assignment.get(a.id, [])
            target_ids = assignment_target_practice_test_ids(a)
            pt_first = PracticeTest.objects.filter(pk=target_ids[0]).first() if target_ids else None
            title_fallback = a.pastpaper_pack.title if a.pastpaper_pack_id and a.pastpaper_pack else None
            assignments_summary.append(
                {
                    "assignment_id": a.id,
                    "title": a.title,
                    "due_at": a.due_at.isoformat() if a.due_at else None,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                    "practice_test_id": target_ids[0] if target_ids else None,
                    "practice_test_title": (pt_first.title if pt_first else None) or title_fallback,
                    "subject": pt_first.subject if pt_first else None,
                    "group_mean_score": round(mean(scores), 1) if scores else None,
                    "completed_count": len(scores),
                    "student_headcount": n_students,
                    "completion_rate_pct": round(100.0 * len(scores) / n_students, 1) if n_students else 0.0,
                }
            )

        rows = []
        for mem in student_memberships:
            u = mem.user
            scores_list: list[int] = []
            for a in practice_assignments:
                s = sub_map.get((u.id, a.id))
                att = s.attempt if s else None
                if att and att.is_completed and att.score is not None:
                    if att.practice_test_id in assignment_target_practice_test_ids(a):
                        scores_list.append(att.score)

            latest_practice = None
            if latest_pa:
                s = sub_map.get((u.id, latest_pa.id))
                att = s.attempt if s else None
                lt_ids = assignment_target_practice_test_ids(latest_pa)
                pt = PracticeTest.objects.filter(pk=lt_ids[0]).first() if lt_ids else None
                title_fb = latest_pa.pastpaper_pack.title if latest_pa.pastpaper_pack_id and latest_pa.pastpaper_pack else None
                latest_practice = {
                    "assignment_id": latest_pa.id,
                    "assignment_title": latest_pa.title,
                    "practice_test_title": (pt.title if pt else None) or title_fb,
                    "subject": pt.subject if pt else None,
                    "score": att.score
                    if att and att.is_completed and att.score is not None
                    else None,
                    "submitted_at": att.submitted_at.isoformat() if att and att.submitted_at else None,
                    "attempt_id": att.id if att else None,
                    "in_progress": bool(att and not att.is_completed),
                }

            practice_average = round(sum(scores_list) / len(scores_list), 1) if scores_list else None
            rows.append(
                {
                    "user_id": u.id,
                    "first_name": u.first_name or "",
                    "last_name": u.last_name or "",
                    "username": getattr(u, "username", None) or "",
                    "email": u.email or "",
                    "latest_practice": latest_practice,
                    "practice_average": practice_average,
                    "practice_completed_count": len(scores_list),
                    "practice_total_assigned": len(practice_assignments),
                }
            )

        rows.sort(
            key=lambda r: (
                -(r["practice_average"] if r["practice_average"] is not None else -1.0),
                -r["practice_completed_count"],
                (r["first_name"] or r["email"]).lower(),
            )
        )
        for i, r in enumerate(rows, start=1):
            r["rank"] = i

        student_avgs = [r["practice_average"] for r in rows if r["practice_average"] is not None]
        class_practice_average = round(mean(student_avgs), 1) if student_avgs else None

        global_means = [x["group_mean_score"] for x in assignments_summary if x["group_mean_score"] is not None]
        overall_assignment_mean = round(mean(global_means), 1) if global_means else None

        return Response(
            {
                "classroom_id": classroom.id,
                "classroom_name": classroom.name,
                "student_count": n_students,
                "practice_assignment_count": len(practice_assignments),
                "class_practice_average": class_practice_average,
                "overall_group_mean_of_assignments": overall_assignment_mean,
                "assignments_summary": assignments_summary,
                "students": rows,
            }
        )


class JoinClassView(APIView):
    permission_classes = [IsAuthenticatedAndNotFrozen]

    def post(self, request):
        code = (request.data.get("join_code") or "").strip().upper()
        if not code:
            return Response({"detail": "Missing join_code."}, status=status.HTTP_400_BAD_REQUEST)
        classroom = Classroom.objects.filter(join_code=code, is_active=True).first()
        if not classroom:
            return Response({"detail": "Invalid class code."}, status=status.HTTP_400_BAD_REQUEST)

        if classroom.max_students is not None:
            current_students = classroom.memberships.filter(role="STUDENT").count()
            already_member = classroom.memberships.filter(user=request.user).exists()
            if not already_member and current_students >= classroom.max_students:
                return Response({"detail": "This group is full."}, status=status.HTTP_400_BAD_REQUEST)
        mem, created = ClassroomMembership.objects.get_or_create(
            classroom=classroom, user=request.user, defaults={"role": "STUDENT"}
        )
        return Response(
            {"joined": True, "role": mem.role, "classroom": ClassroomSerializer(classroom, context={"request": request}).data}
        )


class ClassPostViewSet(ModelViewSet):
    permission_classes = [IsAuthenticatedAndNotFrozen]
    serializer_class = ClassPostSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_classroom(self):
        return get_object_or_404(Classroom, pk=self.kwargs["classroom_pk"])

    def get_queryset(self):
        classroom = self.get_classroom()
        # membership enforced
        if not classroom.memberships.filter(user=self.request.user).exists():
            return ClassPost.objects.none()
        return ClassPost.objects.filter(classroom=classroom).select_related("author")

    def create(self, request, *args, **kwargs):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can post."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save(classroom=classroom, author=request.user)
        return Response(self.get_serializer(post).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        classroom = serializer.instance.classroom
        if not classroom.memberships.filter(user=self.request.user, role="ADMIN").exists():
            raise PermissionDenied("Only class admins can edit announcements.")
        serializer.save()

    def perform_destroy(self, instance):
        if not instance.classroom.memberships.filter(user=self.request.user, role="ADMIN").exists():
            raise PermissionDenied("Only class admins can delete announcements.")
        instance.delete()


class AssignmentViewSet(ModelViewSet):
    permission_classes = [IsAuthenticatedAndNotFrozen]
    serializer_class = AssignmentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_classroom(self):
        return get_object_or_404(Classroom, pk=self.kwargs["classroom_pk"])

    def get_queryset(self):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=self.request.user).exists():
            return Assignment.objects.none()
        return Assignment.objects.filter(classroom=classroom).select_related(
            "created_by", "mock_exam", "practice_test", "pastpaper_pack", "module"
        ).prefetch_related("extra_attachments").annotate(submissions_count=Count("submissions"))

    def create(self, request, *args, **kwargs):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can create assignments."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save(classroom=classroom, created_by=request.user)
        files = list(request.FILES.getlist("attachment_file"))
        if not files:
            files = list(request.FILES.getlist("attachment_files"))
        if not files:
            files = list(request.FILES.getlist("attachment_file[]"))
        if files:
            assignment.attachment_file = files[0]
            assignment.save(update_fields=["attachment_file", "updated_at"])
            for f in files[1:]:
                AssignmentExtraAttachment.objects.create(assignment=assignment, file=f)
        return Response(self.get_serializer(assignment).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        assignment = self.get_object()
        files = list(request.FILES.getlist("attachment_file"))
        if not files:
            files = list(request.FILES.getlist("attachment_files"))
        if not files:
            files = list(request.FILES.getlist("attachment_file[]"))
        if files:
            assignment.attachment_file = files[0]
            assignment.save(update_fields=["attachment_file", "updated_at"])
            for f in files[1:]:
                AssignmentExtraAttachment.objects.create(assignment=assignment, file=f)
        return Response(self.get_serializer(assignment).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if not instance.classroom.memberships.filter(user=self.request.user, role="ADMIN").exists():
            raise PermissionDenied("Only class admins can delete assignments.")
        instance.delete()

    def perform_update(self, serializer):
        if not serializer.instance.classroom.memberships.filter(user=self.request.user, role="ADMIN").exists():
            raise PermissionDenied("Only class admins can edit assignments.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, classroom_pk=None, pk=None):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user).exists():
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
        assignment = get_object_or_404(Assignment, pk=pk, classroom=classroom)
        is_admin = classroom.memberships.filter(user=request.user, role="ADMIN").exists()
        if assignment.due_at and timezone.now() > assignment.due_at and not is_admin:
            return Response(
                {"detail": "The due date has passed. You can no longer change your submission."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sub, _ = Submission.objects.get_or_create(assignment=assignment, student=request.user)
        if "text_response" in data:
            sub.text_response = data.get("text_response") or ""
        if data.get("upload_file") is not None:
            # If upload_file is provided, update it. (Clearing can be added later.)
            sub.upload_file = data.get("upload_file")

        if "attempt_id" in data:
            attempt_id = data.get("attempt_id")
            if attempt_id is None:
                sub.attempt = None
            else:
                att = TestAttempt.objects.filter(id=attempt_id, student=request.user).first()
                if not att:
                    return Response({"detail": "Invalid attempt id for your account."}, status=status.HTTP_400_BAD_REQUEST)
                targets = assignment_target_practice_test_ids(assignment)
                if targets and att.practice_test_id not in targets:
                    return Response(
                        {"detail": "That attempt does not belong to a practice test linked to this homework."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                sub.attempt = att

        if data.get("submit", True):
            sub.mark_submitted()
        sub.save()
        return Response(SubmissionSerializer(sub, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="my-submission")
    def my_submission(self, request, classroom_pk=None, pk=None):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user).exists():
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
        assignment = get_object_or_404(Assignment, pk=pk, classroom=classroom)
        sub = Submission.objects.filter(assignment=assignment, student=request.user).select_related("attempt").first()
        if not sub:
            return Response({}, status=status.HTTP_200_OK)
        return Response(SubmissionSerializer(sub, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="submissions")
    def submissions(self, request, classroom_pk=None, pk=None):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can view submissions."}, status=status.HTTP_403_FORBIDDEN)
        assignment = get_object_or_404(Assignment, pk=pk, classroom=classroom)
        qs = Submission.objects.filter(assignment=assignment).select_related("student").select_related("grade")
        return Response(SubmissionSerializer(qs, many=True, context={"request": request}).data)


class SubmissionAdminViewSet(ReadOnlyModelViewSet):
    """
    Grading: list/retrieve only for submissions in classes where the user is ADMIN.
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        admin_class_ids = ClassroomMembership.objects.filter(
            user=user, role=ClassroomMembership.ROLE_ADMIN
        ).values_list("classroom_id", flat=True)
        return (
            Submission.objects.filter(assignment__classroom_id__in=admin_class_ids)
            .select_related("assignment__classroom", "student", "grade")
            .distinct()
        )

    def list(self, request, *args, **kwargs):
        """Avoid accidental bulk export; grading uses per-assignment submissions/ or retrieve by id."""
        return Response(
            {"detail": "Listing all submissions is not supported. Use class assignment submissions."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def get_classroom(self):
        submission = self.get_object()
        return submission.assignment.classroom

    @action(detail=True, methods=["post"], url_path="grade")
    def grade(self, request, pk=None):
        submission = self.get_object()
        classroom = submission.assignment.classroom
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can grade."}, status=status.HTTP_403_FORBIDDEN)

        serializer = GradeUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        grade, _ = Grade.objects.get_or_create(submission=submission, defaults={"graded_by": request.user})
        # if existing grade created by someone else, keep graded_by but update score/feedback
        if "score" in data:
            grade.score = data["score"]
        if "feedback" in data:
            grade.feedback = data["feedback"]
        grade.graded_by = request.user
        grade.graded_at = timezone.now()
        grade.save()

        submission.refresh_from_db()
        return Response(SubmissionSerializer(submission, context={"request": request}).data)

