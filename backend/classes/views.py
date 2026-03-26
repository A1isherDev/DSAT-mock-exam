from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from exams.models import TestAttempt
from users.permissions import IsAuthenticatedAndNotFrozen

from .models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    Submission,
    Grade,
)
from .permissions import IsAdminUser, IsClassAdmin, IsClassMember
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
        if not getattr(request.user, "is_admin", False):
            return Response({"detail": "Only admins can create classes."}, status=status.HTTP_403_FORBIDDEN)
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

    def partial_update(self, request, *args, **kwargs):
        classroom = self.get_object()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can edit groups."}, status=status.HTTP_403_FORBIDDEN)
        response = super().partial_update(request, *args, **kwargs)
        instance = self.get_object()
        teacher = instance.teacher
        if teacher:
            ClassroomMembership.objects.get_or_create(
                classroom=instance, user=teacher, defaults={"role": "ADMIN"}
            )
        return response

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

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
            "created_by", "mock_exam", "practice_test", "module"
        ).annotate(submissions_count=Count("submissions"))

    def create(self, request, *args, **kwargs):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user, role="ADMIN").exists():
            return Response({"detail": "Only class admins can create assignments."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        a = serializer.save(classroom=classroom, created_by=request.user)
        return Response(self.get_serializer(a).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, classroom_pk=None, pk=None):
        classroom = self.get_classroom()
        if not classroom.memberships.filter(user=request.user).exists():
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
        assignment = get_object_or_404(Assignment, pk=pk, classroom=classroom)
        # Editing submission is allowed only before deadline.
        if assignment.due_at and timezone.now() > assignment.due_at:
            existing = Submission.objects.filter(assignment=assignment, student=request.user).first()
            if existing and existing.status == Submission.STATUS_SUBMITTED:
                return Response({"detail": "Deadline passed. Submission can no longer be edited."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sub, _ = Submission.objects.get_or_create(assignment=assignment, student=request.user)
        if "text_response" in data:
            sub.text_response = data.get("text_response") or ""
        if data.get("upload_file") is not None:
            # If upload_file is provided, update it. (Clearing can be added later.)
            sub.upload_file = data.get("upload_file")

        attempt_id = data.get("attempt_id")
        if attempt_id:
            att = TestAttempt.objects.filter(id=attempt_id, student=request.user).first()
            if att:
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
        return Response(SubmissionSerializer(sub, context={"request": request}).data if sub else None)

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
    Admin-only grading endpoints.
    """

    permission_classes = [IsAuthenticatedAndNotFrozen]
    serializer_class = SubmissionSerializer
    queryset = Submission.objects.all().select_related("assignment__classroom", "student").select_related("grade")

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

