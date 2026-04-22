import re
import unicodedata

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from django.utils import timezone

from .models import (
    BulkAssignmentDispatch,
    MockExam,
    Module,
    PastpaperPack,
    PortalMockExam,
    PracticeTest,
    Question,
    TestAttempt,
)

User = get_user_model()

MIDTERM_ALLOWED_SCORES = frozenset({1, 2, 3, 5, 8, 10})
MIDTERM_MAX_TOTAL_POINTS = 100


def _normalize_platform_subject_value(raw):
    """Canonical READING_WRITING | MATH for API output (legacy rows / typos)."""
    if raw is None:
        return None
    s = str(raw).strip()
    s = re.sub(r"[\u200b-\u200f\ufeff]", "", s).strip()
    if not s:
        return None
    s = unicodedata.normalize("NFKC", s).strip()
    if not s:
        return None
    u = re.sub(r"\s+", "_", s.upper())
    if u in ("MATH", "MATHEMATICS", "MATHS"):
        return "MATH"
    if u in (
        "READING_WRITING",
        "RW",
        "READING",
        "WRITING",
        "ENGLISH",
        "R&W",
        "R_AND_W",
    ) or ("READING" in u and "WRITING" in u):
        return "READING_WRITING"
    low = s.lower()
    if low in ("math", "mathematics", "maths", "matematika", "математика"):
        return "MATH"
    if "reading" in low and "writing" in low:
        return "READING_WRITING"
    return raw


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'question_type', 'question_text', 'question_prompt', 'question_image', 'is_math_input',
                  'option_a_image', 'option_b_image', 'option_c_image', 'option_d_image']
        
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['options'] = instance.get_options()
        return representation

class ModuleSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes', 'questions']

class ModuleListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes']

class PracticeTestMockExamBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockExam
        fields = ["id", "title", "kind", "practice_date"]


class PortalMockExamStudentSerializer(serializers.ModelSerializer):
    """Student mock list: no nested PracticeTest objects."""

    mock_exam_id = serializers.IntegerField(source="mock_exam.id", read_only=True)
    title = serializers.CharField(source="mock_exam.title", read_only=True)
    practice_date = serializers.DateField(source="mock_exam.practice_date", read_only=True)
    kind = serializers.CharField(source="mock_exam.kind", read_only=True)
    is_published = serializers.BooleanField(source="mock_exam.is_published", read_only=True)
    section_test_ids = serializers.SerializerMethodField()

    def get_section_test_ids(self, obj):
        return list(obj.mock_exam.tests.values_list("id", flat=True))

    class Meta:
        model = PortalMockExam
        fields = ["id", "mock_exam_id", "title", "practice_date", "kind", "is_published", "section_test_ids"]


class PastpaperPackBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = PastpaperPack
        fields = ["id", "title", "practice_date", "label", "form_type"]


class PracticeTestSerializer(serializers.ModelSerializer):
    """Student practice library: past papers only (mock_exam_id must be null for /exams/ list)."""

    modules = ModuleListSerializer(many=True, read_only=True)
    subject = serializers.CharField()
    pastpaper_pack = PastpaperPackBriefSerializer(read_only=True)
    mock_exam_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = PracticeTest
        fields = [
            "id",
            "title",
            "practice_date",
            "subject",
            "label",
            "form_type",
            "modules",
            "created_at",
            "pastpaper_pack",
            "mock_exam_id",
        ]
        read_only_fields = ["created_at", "mock_exam_id"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        canon = _normalize_platform_subject_value(data.get("subject"))
        if canon is not None:
            data["subject"] = canon
        return data


class MockExamSerializer(serializers.ModelSerializer):
    tests = PracticeTestSerializer(many=True, read_only=True)

    class Meta:
        model = MockExam
        fields = [
            "id",
            "title",
            "practice_date",
            "is_active",
            "is_published",
            "published_at",
            "kind",
            "midterm_subject",
            "midterm_module_count",
            "midterm_module1_minutes",
            "midterm_module2_minutes",
            "tests",
        ]

from users.serializers import UserSerializer

class TestAttemptSerializer(serializers.ModelSerializer):
    practice_test_details = serializers.SerializerMethodField()
    current_module_details = ModuleSerializer(source='current_module', read_only=True)
    student_details = UserSerializer(source='student', read_only=True)
    is_expired = serializers.SerializerMethodField()
    module_results = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()
    current_module_saved_answers = serializers.SerializerMethodField()
    current_module_flagged_questions = serializers.SerializerMethodField()

    def get_is_expired(self, obj):
        return getattr(obj, 'is_expired', False)
        
    def get_module_results(self, obj):
        return obj.get_module_results() if obj.is_completed else None
    
    def get_server_now(self, obj):
        return timezone.now().isoformat()

    def get_current_module_saved_answers(self, obj):
        """
        Resume support: return saved answers for the currently active module only.
        Never include correct answers; review endpoint remains gated behind completion.
        """
        mod = getattr(obj, "current_module", None)
        if not mod:
            return None
        try:
            return (obj.module_answers or {}).get(str(mod.id), {}) or {}
        except Exception:
            return {}

    def get_current_module_flagged_questions(self, obj):
        mod = getattr(obj, "current_module", None)
        if not mod:
            return None
        try:
            return (obj.flagged_questions or {}).get(str(mod.id), []) or []
        except Exception:
            return []

    def get_practice_test_details(self, obj):
        pt = obj.practice_test
        mock = pt.mock_exam
        subj = _normalize_platform_subject_value(pt.subject) or pt.subject
        return {
            "id": pt.id,
            "subject": subj,
            "title": mock.title if mock else "",
            "practice_date": mock.practice_date.isoformat() if mock and mock.practice_date else None,
            "is_active": mock.is_active if mock else True,
            "mock_exam_id": mock.id if mock else None,
            "mock_kind": mock.kind if mock else None,
            "modules": ModuleListSerializer(pt.modules.all(), many=True).data,
        }
    
    class Meta:
        model = TestAttempt
        fields = [
            'id', 'practice_test', 'practice_test_details', 'student', 'student_details', 'started_at', 'submitted_at', 
            'current_module', 'current_module_details', 'current_module_start_time',
            'current_state',
            'module_1_started_at', 'module_1_submitted_at',
            'module_2_started_at', 'module_2_submitted_at',
            'scoring_started_at', 'completed_at',
            'version_number',
            'is_completed', 'is_expired', 'score', 'completed_modules', 'module_results',
            'server_now',
            'current_module_saved_answers',
            'current_module_flagged_questions',
        ]

        read_only_fields = [
            'student',
            'started_at',
            'submitted_at',
            'current_module',
            'current_module_start_time',
            'current_state',
            'module_1_started_at', 'module_1_submitted_at',
            'module_2_started_at', 'module_2_submitted_at',
            'scoring_started_at', 'completed_at',
            'version_number',
            'is_completed',
            'score',
            'completed_modules',
            'server_now',
        ]

# ── Admin Serializers ────────────────────────────────────────────────────────

class AdminQuestionSerializer(serializers.ModelSerializer):
    correct_answer = serializers.CharField(source='correct_answers', required=True)
    module_id = serializers.IntegerField(read_only=True)
    practice_test_id = serializers.IntegerField(source="module.practice_test_id", read_only=True)
    option_a = serializers.CharField(required=False, allow_blank=True)
    option_b = serializers.CharField(required=False, allow_blank=True)
    option_c = serializers.CharField(required=False, allow_blank=True)
    option_d = serializers.CharField(required=False, allow_blank=True)
    clear_question_image = serializers.BooleanField(write_only=True, required=False)
    clear_option_a_image = serializers.BooleanField(write_only=True, required=False)
    clear_option_b_image = serializers.BooleanField(write_only=True, required=False)
    clear_option_c_image = serializers.BooleanField(write_only=True, required=False)
    clear_option_d_image = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Question
        fields = ['id', 'module_id', 'practice_test_id', 'question_type', 'question_text', 'question_prompt', 'question_image',
                  'is_math_input', 'correct_answer', 'score', 'explanation', 'order',
                  'option_a', 'option_b', 'option_c', 'option_d',
                  'option_a_image', 'option_b_image', 'option_c_image', 'option_d_image',
                  'clear_question_image', 'clear_option_a_image', 'clear_option_b_image',
                  'clear_option_c_image', 'clear_option_d_image']

    def create(self, validated_data):
        # Clear flags are serializer-only controls and must not be passed to model create().
        validated_data.pop('clear_question_image', None)
        validated_data.pop('clear_option_a_image', None)
        validated_data.pop('clear_option_b_image', None)
        validated_data.pop('clear_option_c_image', None)
        validated_data.pop('clear_option_d_image', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        clear_question_image = validated_data.pop('clear_question_image', False)
        clear_option_a_image = validated_data.pop('clear_option_a_image', False)
        clear_option_b_image = validated_data.pop('clear_option_b_image', False)
        clear_option_c_image = validated_data.pop('clear_option_c_image', False)
        clear_option_d_image = validated_data.pop('clear_option_d_image', False)

        # Only clear when requested AND no replacement file was uploaded.
        if clear_question_image and 'question_image' not in validated_data:
            if instance.question_image:
                instance.question_image.delete(save=False)
            instance.question_image = None

        if clear_option_a_image and 'option_a_image' not in validated_data:
            if instance.option_a_image:
                instance.option_a_image.delete(save=False)
            instance.option_a_image = None

        if clear_option_b_image and 'option_b_image' not in validated_data:
            if instance.option_b_image:
                instance.option_b_image.delete(save=False)
            instance.option_b_image = None

        if clear_option_c_image and 'option_c_image' not in validated_data:
            if instance.option_c_image:
                instance.option_c_image.delete(save=False)
            instance.option_c_image = None

        if clear_option_d_image and 'option_d_image' not in validated_data:
            if instance.option_d_image:
                instance.option_d_image.delete(save=False)
            instance.option_d_image = None

        return super().update(instance, validated_data)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        score = attrs.get("score")
        if self.instance is not None and score is None:
            score = self.instance.score
        if score is None:
            score = 10
        try:
            score = int(score)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"score": "Invalid score."})
        attrs["score"] = score

        module = None
        if self.instance is not None:
            module = self.instance.module
        else:
            view = self.context.get("view")
            if view is not None and hasattr(view, "kwargs"):
                test_pk = view.kwargs.get("test_pk")
                module_pk = view.kwargs.get("module_pk")
                if test_pk and module_pk:
                    module = get_object_or_404(
                        Module, pk=module_pk, practice_test_id=test_pk
                    )

        if module is None:
            return attrs

        pt = module.practice_test
        exam = getattr(pt, "mock_exam", None)
        if exam is None and pt.mock_exam_id:
            exam = MockExam.objects.filter(pk=pt.mock_exam_id).first()
        if exam is None or exam.kind != MockExam.KIND_MIDTERM:
            return attrs

        if score not in MIDTERM_ALLOWED_SCORES:
            raise serializers.ValidationError(
                {
                    "score": "Midterm questions must use scores 1, 2, 3, 5, 8, or 10."
                }
            )

        qs = Question.objects.filter(module__practice_test=pt)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        current_sum = qs.aggregate(s=Sum("score"))["s"] or 0
        if current_sum + score > MIDTERM_MAX_TOTAL_POINTS:
            raise serializers.ValidationError(
                {
                    "score": f"Total midterm points cannot exceed {MIDTERM_MAX_TOTAL_POINTS}."
                }
            )
        return attrs


class AdminModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes']

    def create(self, validated_data):
        test = self.context['test']
        return Module.objects.create(practice_test=test, **validated_data)


class AdminPracticeTestSerializer(serializers.ModelSerializer):
    modules = AdminModuleSerializer(many=True, read_only=True)
    subject = serializers.CharField()
    assigned_users = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )
    pastpaper_pack = serializers.PrimaryKeyRelatedField(
        queryset=PastpaperPack.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = PracticeTest
        fields = [
            "id",
            "title",
            "practice_date",
            "subject",
            "label",
            "form_type",
            "mock_exam",
            "pastpaper_pack",
            "modules",
            "assigned_users",
        ]
        read_only_fields = ["mock_exam"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Prefer model field — DB enum is always READING_WRITING | MATH when valid.
        v = getattr(instance, "subject", None)
        if v:
            canon = _normalize_platform_subject_value(v)
            if canon in ("MATH", "READING_WRITING"):
                data["subject"] = canon
            else:
                data["subject"] = str(v)
        return data

    def validate(self, attrs):
        instance = self.instance
        pack = attrs.get("pastpaper_pack", serializers.empty)
        if pack is serializers.empty or instance is None:
            return attrs
        subj = attrs.get("subject", instance.subject)
        if pack is not None:
            qs = PracticeTest.objects.filter(pastpaper_pack=pack, subject=subj)
            qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"pastpaper_pack": "Target pack already has a section for this subject."}
                )
        return attrs

    def create(self, validated_data):
        assigned_users = validated_data.pop("assigned_users", [])
        inst = super().create(validated_data)
        if assigned_users:
            inst.assigned_users.set(assigned_users)
        return inst

    def update(self, instance, validated_data):
        assigned_users = validated_data.pop("assigned_users", serializers.empty)
        inst = super().update(instance, validated_data)
        if assigned_users is not serializers.empty:
            inst.assigned_users.set(assigned_users)
        return inst


class AdminPastpaperPackSerializer(serializers.ModelSerializer):
    sections = AdminPracticeTestSerializer(many=True, read_only=True)

    class Meta:
        model = PastpaperPack
        fields = [
            "id",
            "title",
            "practice_date",
            "label",
            "form_type",
            "sections",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class AdminMockExamSerializer(serializers.ModelSerializer):
    tests = AdminPracticeTestSerializer(many=True, read_only=True)
    publish_ready = serializers.SerializerMethodField()
    publish_block_reason = serializers.SerializerMethodField()

    class Meta:
        model = MockExam
        fields = [
            "id",
            "title",
            "practice_date",
            "is_active",
            "is_published",
            "published_at",
            "kind",
            "midterm_subject",
            "midterm_module_count",
            "midterm_module1_minutes",
            "midterm_module2_minutes",
            "midterm_target_question_count",
            "tests",
            "publish_ready",
            "publish_block_reason",
        ]
        read_only_fields = ["is_published", "published_at", "publish_ready", "publish_block_reason"]

    def get_publish_ready(self, obj):
        from .publish_service import mock_exam_publish_ready

        ok, _ = mock_exam_publish_ready(obj)
        return ok

    def get_publish_block_reason(self, obj):
        from .publish_service import mock_exam_publish_ready

        ok, msg = mock_exam_publish_ready(obj)
        return "" if ok else msg

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", MockExam.KIND_MOCK_SAT))
        if kind == MockExam.KIND_MIDTERM:
            mc = attrs.get(
                "midterm_module_count",
                getattr(self.instance, "midterm_module_count", 2) if self.instance else 2,
            )
            if mc not in (1, 2):
                raise serializers.ValidationError(
                    {"midterm_module_count": "Must be 1 or 2."}
                )
        return attrs


class BulkAssignmentDispatchSerializer(serializers.ModelSerializer):
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BulkAssignmentDispatch
        fields = [
            "id",
            "kind",
            "subject_summary",
            "students_requested_count",
            "students_granted_count",
            "assigned_by",
            "assigned_by_name",
            "status",
            "created_at",
        ]
        read_only_fields = fields

    def get_assigned_by_name(self, obj):
        u = obj.assigned_by
        if not u:
            return ""
        parts = [getattr(u, "first_name", None) or "", getattr(u, "last_name", None) or ""]
        name = " ".join(p for p in parts if p).strip()
        if name:
            return name
        return (getattr(u, "username", None) or getattr(u, "email", None) or "").strip() or f"User #{u.pk}"


class BulkAssignmentDispatchDetailSerializer(serializers.ModelSerializer):
    assigned_by_name = serializers.SerializerMethodField()
    skipped_users = serializers.SerializerMethodField()

    class Meta:
        model = BulkAssignmentDispatch
        fields = [
            "id",
            "kind",
            "subject_summary",
            "students_requested_count",
            "students_granted_count",
            "assigned_by",
            "assigned_by_name",
            "status",
            "payload",
            "result",
            "rerun_of",
            "created_at",
            "actor_snapshot",
            "skipped_users",
        ]
        read_only_fields = fields

    def get_assigned_by_name(self, obj):
        return BulkAssignmentDispatchSerializer().get_assigned_by_name(obj)

    def get_skipped_users(self, obj):
        res = obj.result or {}
        val = res.get("skipped_users") if isinstance(res, dict) else []
        return val or []
