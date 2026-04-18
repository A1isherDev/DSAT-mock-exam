import json

from rest_framework import serializers
from urllib.parse import urlparse
from django.core.validators import URLValidator

from exams.models import MockExam, PastpaperPack, PracticeTest

from .models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    Submission,
    Grade,
    ClassComment,
    assignment_target_practice_test_ids,
    filter_practice_targets_by_scope,
    grant_practice_test_library_access_for_assignment,
    raw_target_practice_test_ids_from_fks,
    submission_workflow_status,
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
    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        if len(value) > 120:
            raise serializers.ValidationError("Name must be at most 120 characters.")
        return value

    def validate_max_students(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError("max_students must be at least 1.")
        return value

    def validate_lesson_hours(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError("lesson_hours must be at least 1.")
        return value

    def validate_teacher(self, value):
        from access import constants as acc_const
        from access.services import actor_subject_probe_for_domain_perm, authorize

        if value is None:
            return value
        if getattr(value, "is_frozen", False):
            raise serializers.ValidationError("Teacher cannot be a frozen account.")
        subj = actor_subject_probe_for_domain_perm(value)
        if subj and authorize(
            value,
            acc_const.PERM_MANAGE_USERS,
            subject=subj,
        ):
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
    content = serializers.CharField(max_length=50_000, trim_whitespace=False)

    class Meta:
        model = ClassPost
        fields = ["id", "content", "created_at", "author"]
        read_only_fields = ["id", "created_at", "author"]

    def validate_content(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Announcement content cannot be empty.")
        return value

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
    title = serializers.CharField(max_length=200)

    created_by = serializers.SerializerMethodField()
    submissions_count = serializers.IntegerField(read_only=True)
    attachment_file_url = serializers.SerializerMethodField(read_only=True)
    attachment_urls = serializers.SerializerMethodField(read_only=True)
    external_url = serializers.CharField(required=False, allow_blank=True)
    mock_exam = serializers.PrimaryKeyRelatedField(
        queryset=MockExam.objects.all(), required=False, allow_null=True
    )
    practice_test = serializers.PrimaryKeyRelatedField(
        queryset=PracticeTest.objects.all(), required=False, allow_null=True
    )
    pastpaper_pack = serializers.PrimaryKeyRelatedField(
        queryset=PastpaperPack.objects.all(), required=False, allow_null=True
    )
    practice_test_ids = serializers.JSONField(required=False, allow_null=True)
    practice_scope = serializers.ChoiceField(
        choices=Assignment.PRACTICE_SCOPE_CHOICES,
        required=False,
        default=Assignment.PRACTICE_SCOPE_BOTH,
    )
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
            "practice_scope",
            "practice_bundle_tests",
            "module",
            "external_url",
            "attachment_file",
            "attachment_file_url",
            "attachment_urls",
            "created_at",
            "created_by",
            "submissions_count",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "created_by",
            "submissions_count",
            "practice_bundle_tests",
            "attachment_urls",
        ]

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

    def get_attachment_urls(self, obj):
        """Primary file first, then extra attachments (same order as upload)."""
        request = self.context.get("request")
        urls = []
        if obj.attachment_file:
            u = obj.attachment_file.url
            urls.append(request.build_absolute_uri(u) if request else u)
        for ex in obj.extra_attachments.all():
            u = ex.file.url
            urls.append(request.build_absolute_uri(u) if request else u)
        return urls

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

    def validate_title(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Title is required.")
        return text

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
        inst = self.instance

        if inst is not None:
            for fk in ("mock_exam", "practice_test", "pastpaper_pack"):
                if fk in attrs and attrs[fk] == "":
                    attrs[fk] = None
            if "practice_test_ids" in attrs:
                v = attrs["practice_test_ids"]
                if v in (None, "", []):
                    attrs["practice_test_ids"] = None
        else:
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

        attrs = super().validate(attrs)

        mock_id = None
        if "mock_exam" in attrs:
            m = attrs["mock_exam"]
            mock_id = m.pk if m else None
        elif inst is not None:
            mock_id = inst.mock_exam_id

        pp_id = None
        if "pastpaper_pack" in attrs:
            p = attrs["pastpaper_pack"]
            pp_id = p.pk if p else None
        elif inst is not None:
            pp_id = inst.pastpaper_pack_id

        pt_id = None
        if "practice_test" in attrs:
            t = attrs["practice_test"]
            pt_id = t.pk if t else None
        elif inst is not None:
            pt_id = inst.practice_test_id

        pids = attrs["practice_test_ids"] if "practice_test_ids" in attrs else (
            inst.practice_test_ids if inst is not None else None
        )

        scope = attrs.get("practice_scope")
        if scope is None:
            scope = inst.practice_scope if inst is not None else Assignment.PRACTICE_SCOPE_BOTH
        if not scope:
            scope = Assignment.PRACTICE_SCOPE_BOTH
        attrs["practice_scope"] = scope

        raw = raw_target_practice_test_ids_from_fks(mock_id, pp_id, pids, pt_id)
        filtered = filter_practice_targets_by_scope(raw, scope)
        if scope != Assignment.PRACTICE_SCOPE_BOTH and raw and not filtered:
            raise serializers.ValidationError(
                {
                    "practice_scope": "No section matches this choice for the selected mock or pastpaper (e.g. Math-only choice on an English-only test)."
                }
            )

        return attrs

    def create(self, validated_data):
        inst = super().create(validated_data)
        grant_practice_test_library_access_for_assignment(inst)
        return inst

    def update(self, instance, validated_data):
        inst = super().update(instance, validated_data)
        grant_practice_test_library_access_for_assignment(inst)
        return inst

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
    workflow_status = serializers.SerializerMethodField()

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
            "workflow_status",
        ]
        read_only_fields = ["id", "submitted_at", "updated_at", "student", "grade", "workflow_status"]

    def get_workflow_status(self, obj):
        return submission_workflow_status(obj)

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
    text_response = serializers.CharField(required=False, allow_blank=True, max_length=100_000)
    upload_file = serializers.FileField(required=False, allow_null=True)
    # Accept "" from multipart forms to clear the linked attempt; integers still allowed.
    attempt_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_attempt_id(self, value):
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError("Invalid attempt id.")

    submit = serializers.BooleanField(required=False, default=True)


class GradeUpsertSerializer(serializers.Serializer):
    score = serializers.DecimalField(required=False, max_digits=6, decimal_places=2, allow_null=True)
    feedback = serializers.CharField(required=False, allow_blank=True)


class ClassCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ClassComment
        fields = ["id", "classroom", "target_type", "target_id", "parent", "content", "author", "created_at", "updated_at"]
        read_only_fields = ["id", "classroom", "author", "created_at", "updated_at"]

    def get_author(self, obj):
        u = obj.author
        return {
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", None),
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def validate_content(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Comment cannot be empty.")
        if len(text) > 10_000:
            raise serializers.ValidationError("Comment is too long.")
        return text

    def validate(self, attrs):
        classroom = attrs.get("classroom") or self.context.get("classroom") or (
            self.instance.classroom if self.instance else None
        )
        t_type = attrs.get("target_type") or (self.instance.target_type if self.instance else None)
        t_id = attrs.get("target_id") if "target_id" in attrs else (self.instance.target_id if self.instance else None)
        parent = attrs.get("parent") if "parent" in attrs else None
        if parent is None and self.instance:
            parent = self.instance.parent
        if classroom and t_type and t_id is not None:
            if t_type == ClassComment.TARGET_POST:
                if not ClassPost.objects.filter(pk=t_id, classroom=classroom).exists():
                    raise serializers.ValidationError({"target_id": "Announcement not found in this class."})
            elif t_type == ClassComment.TARGET_ASSIGNMENT:
                if not Assignment.objects.filter(pk=t_id, classroom=classroom).exists():
                    raise serializers.ValidationError({"target_id": "Assignment not found in this class."})
        if parent and classroom:
            if parent.classroom_id != classroom.pk or parent.target_type != t_type or parent.target_id != t_id:
                raise serializers.ValidationError({"parent": "Reply must belong to the same thread."})
        return attrs

