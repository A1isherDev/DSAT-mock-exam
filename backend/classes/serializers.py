from rest_framework import serializers

from .models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    Submission,
    Grade,
)


class ClassroomSerializer(serializers.ModelSerializer):
    members_count = serializers.IntegerField(read_only=True)
    my_role = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "subject",
            "section",
            "lesson_schedule",
            "max_students",
            "description",
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


class ClassroomCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "subject",
            "section",
            "lesson_schedule",
            "max_students",
            "description",
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

    class Meta:
        model = Assignment
        fields = [
            "id",
            "title",
            "instructions",
            "due_at",
            "mock_exam",
            "practice_test",
            "module",
            "external_url",
            "attachment_file",
            "attachment_file_url",
            "created_at",
            "created_by",
            "submissions_count",
        ]
        read_only_fields = ["id", "created_at", "created_by", "submissions_count"]

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

