import json

from rest_framework import serializers
from urllib.parse import urlparse
from django.core.validators import URLValidator

from exams.models import PastpaperPack, PracticeTest

from .models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    Submission,
    Grade,
    assignment_target_practice_test_ids,
)


class ClassroomSerializer(serializers.ModelSerializer):
    members_count = serializers.IntegerField(read_only=True)
    my_role = serializers.SerializerMethodField(read_only=True)
    teacher_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "subject",
            "lesson_days",
            "lesson_time",
            "lesson_hours",
            "start_date",
            "room_number",
            "telegram_chat_id",
            "max_students",
            "teacher",
            "teacher_details",
            "join_code",
            "is_active",
            "created_at",
            "members_count",
            "my_role",
        ]
        read_only_fields = ["join_code", "created_at", "members_count"]

    def get_my_role(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not getattr(user, "is_authenticated", False):
            return None
        mem = obj.memberships.filter(user=user).only("role").first()
        return mem.role if mem else None

    def get_teacher_details(self, obj):
        t = obj.teacher
        if not t:
            return None
        return {
            "id": t.id,
            "email": t.email,
            "username": getattr(t, "username", None),
            "first_name": t.first_name,
            "last_name": t.last_name,
        }


class ClassroomCreateSerializer(serializers.ModelSerializer):
    def validate_teacher(self, value):
        from access import constants as acc_const
        from access.services import authorize

        if value is None:
            return value
        if getattr(value, "is_frozen", False):
            raise serializers.ValidationError("Teacher cannot be a frozen account.")
        if authorize(value, acc_const.PERM_MANAGE_USERS):
            return value
        # Allow keeping the current teacher on update so demoted users do not block all edits.
        instance = getattr(self, "instance", None)
        if instance is not None and instance.teacher_id == value.pk:
            return value
        raise serializers.ValidationError("Teacher must have user-management permission.")

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "subject",
            "lesson_days",
            "lesson_time",
            "lesson_hours",
            "start_date",
            "room_number",
            "telegram_chat_id",
            "max_students",
            "teacher",
            "is_active",
            "join_code",
            "created_at",
        ]
        read_only_fields = ["id", "join_code", "created_at"]


class ClassroomMembershipSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = ClassroomMembership
        fields = ["id", "role", "joined_at", "user"]

    def get_user(self, obj):
        u = obj.user
        return {
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", None),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "profile_image_url": getattr(u, "profile_image", None).url if getattr(u, "profile_image", None) else None,
        }


class ClassPostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = ClassPost
        fields = ["id", "content", "created_at", "author"]
        read_only_fields = ["id", "created_at", "author"]

    def get_author(self, obj):
        u = obj.author
        return {
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", None),
            "first_name": u.first_name,
            "last_name": u.last_name,
        }


class AssignmentSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    submissions_count = serializers.IntegerField(read_only=True)
    attachment_file_url = serializers.SerializerMethodField(read_only=True)
    external_url = serializers.CharField(required=False, allow_blank=True)
    pastpaper_pack = serializers.PrimaryKeyRelatedField(
        queryset=PastpaperPack.objects.all(), required=False, allow_null=True
    )
    practice_test_ids = serializers.JSONField(required=False, allow_null=True)
    practice_bundle_tests = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id",
            "title",
            "instructions",
            "due_at",
            "mock_exam",
            "practice_test",
            "pastpaper_pack",
            "practice_test_ids",
            "practice_bundle_tests",
            "module",
            "external_url",
            "attachment_file",
            "attachment_file_url",
            "created_at",
            "created_by",
            "submissions_count",
        ]
        read_only_fields = ["id", "created_at", "created_by", "submissions_count", "practice_bundle_tests"]

    def get_created_by(self, obj):
        u = obj.created_by
        return {
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", None),
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def get_attachment_file_url(self, obj):
        if not obj.attachment_file:
            return None
        request = self.context.get("request")
        url = obj.attachment_file.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_practice_bundle_tests(self, obj):
        ids = assignment_target_practice_test_ids(obj)
        if not ids:
            return []
        order = {"READING_WRITING": 0, "MATH": 1}
        pts = list(PracticeTest.objects.filter(id__in=ids))
        pts.sort(key=lambda p: (order.get(p.subject, 9), p.id))
        return [
            {"id": p.id, "title": (p.title or "").strip(), "subject": p.subject}
            for p in pts
        ]

    def validate_practice_test_ids(self, value):
        if value is None:
            return None
        if isinstance(value, str):
            s = value.strip()
            if not s or s == "null":
                return None
            value = json.loads(s)
        if not isinstance(value, list):
            raise serializers.ValidationError("practice_test_ids must be a list of integers.")
        if len(value) == 0:
            return None
        out = [int(x) for x in value]
        if len(out) != len(set(out)):
            raise serializers.ValidationError("Duplicate practice test ids.")
        return out

    def validate(self, attrs):
        if self.instance is not None:
            return super().validate(attrs)

        pp = attrs.get("pastpaper_pack")
        pids = attrs.get("practice_test_ids")
        pt = attrs.get("practice_test")

        if pp == "":
            pp = None
        if pt == "":
            pt = None

        if pp is not None:
            attrs["pastpaper_pack"] = pp
            attrs["practice_test"] = None
            attrs["practice_test_ids"] = None
        elif pids:
            attrs["pastpaper_pack"] = None
            attrs["practice_test_ids"] = pids
            if len(pids) == 1:
                attrs["practice_test"] = PracticeTest.objects.filter(pk=pids[0], mock_exam__isnull=True).first()
            else:
                attrs["practice_test"] = None
        else:
            attrs["pastpaper_pack"] = None
            attrs["practice_test_ids"] = None

        return super().validate(attrs)

    def validate_external_url(self, value):
        """
        Accept plain domains like `example.com/file.pdf` by normalizing to https.
        """
        value = (value or "").strip()
        if not value:
            return ""
        parsed = urlparse(value)
        normalized = value if parsed.scheme else f"https://{value}"
        # Reuse DRF URL validator via URLField
        URLValidator()(normalized)
        return normalized


class SubmissionSerializer(serializers.ModelSerializer):
    student = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()
    upload_file_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id",
            "status",
            "text_response",
            "upload_file",
            "upload_file_url",
            "attempt",
            "submitted_at",
            "updated_at",
            "student",
            "grade",
        ]
        read_only_fields = ["id", "submitted_at", "updated_at", "student", "grade"]

    def get_student(self, obj):
        u = obj.student
        return {
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", None),
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def get_grade(self, obj):
        if not hasattr(obj, "grade") or obj.grade is None:
            return None
        g = obj.grade
        return {"score": str(g.score) if g.score is not None else None, "feedback": g.feedback, "graded_at": g.graded_at}

    def get_upload_file_url(self, obj):
        if not obj.upload_file:
            return None
        request = self.context.get("request")
        url = obj.upload_file.url
        if request:
            return request.build_absolute_uri(url)
        return url


class SubmitSerializer(serializers.Serializer):
    text_response = serializers.CharField(required=False, allow_blank=True)
    upload_file = serializers.FileField(required=False, allow_null=True)
    attempt_id = serializers.IntegerField(required=False)
    submit = serializers.BooleanField(required=False, default=True)


class GradeUpsertSerializer(serializers.Serializer):
    score = serializers.DecimalField(required=False, max_digits=6, decimal_places=2, allow_null=True)
    feedback = serializers.CharField(required=False, allow_blank=True)

