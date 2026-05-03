from __future__ import annotations

from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers

from .models import (
    AssessmentSet,
    AssessmentQuestion,
    HomeworkAssignment,
    AssessmentAttempt,
    AssessmentAnswer,
    AssessmentResult,
)


@extend_schema_serializer(component_name="AssessmentQuestion")
class AssessmentQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentQuestion
        fields = [
            "id",
            "order",
            "prompt",
            "question_type",
            "choices",
            "points",
            "is_active",
        ]


class AssessmentQuestionAdminWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentQuestion
        fields = [
            "id",
            "assessment_set",
            "order",
            "prompt",
            "question_type",
            "choices",
            "correct_answer",
            "grading_config",
            "points",
            "is_active",
        ]


@extend_schema_serializer(component_name="AssessmentSet")
class AssessmentSetSerializer(serializers.ModelSerializer):
    questions = AssessmentQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = AssessmentSet
        fields = [
            "id",
            "subject",
            "category",
            "title",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "questions",
        ]


class AssessmentSetAdminWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentSet
        fields = [
            "id",
            "subject",
            "category",
            "title",
            "description",
            "is_active",
        ]


class HomeworkAssignmentSerializer(serializers.ModelSerializer):
    assessment_set = AssessmentSetSerializer(read_only=True)

    class Meta:
        model = HomeworkAssignment
        fields = ["id", "classroom_id", "assignment_id", "assessment_set", "assigned_by_id", "created_at"]


@extend_schema_serializer(component_name="AssessmentAttemptAnswer")
class AttemptAnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = AssessmentAnswer
        fields = [
            "id",
            "question_id",
            "answer",
            "time_spent_seconds",
            "is_correct",
            "points_awarded",
            "answered_at",
        ]


@extend_schema_serializer(component_name="AssessmentAttempt")
class AttemptSerializer(serializers.ModelSerializer):
    answers = AttemptAnswerSerializer(many=True, read_only=True)
    homework_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = AssessmentAttempt
        fields = [
            "id",
            "homework_id",
            "student_id",
            "status",
            "started_at",
            "submitted_at",
            "abandoned_at",
            "last_activity_at",
            "total_time_seconds",
            "active_time_seconds",
            "grading_status",
            "grading_attempts",
            "question_order",
            "answers",
        ]


@extend_schema_serializer(component_name="AssessmentResult")
class ResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentResult
        fields = [
            "id",
            "attempt_id",
            "score_points",
            "max_points",
            "percent",
            "correct_count",
            "total_questions",
            "graded_at",
        ]


class AssignHomeworkSerializer(serializers.Serializer):
    classroom_id = serializers.IntegerField()
    set_id = serializers.IntegerField()
    title = serializers.CharField(required=False, allow_blank=True)
    instructions = serializers.CharField(required=False, allow_blank=True)
    due_at = serializers.DateTimeField(required=False, allow_null=True)


class StartAttemptSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()


class SaveAnswerSerializer(serializers.Serializer):
    attempt_id = serializers.IntegerField()
    question_id = serializers.IntegerField()
    answer = serializers.JSONField(required=False, allow_null=True)
    client_seq = serializers.IntegerField(required=False, min_value=0)
    # Client may send these, but server will ignore for time tracking.
    answered_at = serializers.DateTimeField(required=False)


class SubmitAttemptSerializer(serializers.Serializer):
    attempt_id = serializers.IntegerField()


class ApiAssessmentDetailSerializer(serializers.Serializer):
    """Minimal `{detail}` error payloads returned by assessments student APIs."""

    detail = serializers.CharField()


class SaveAnswerStaleWriteSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()
    server_client_seq = serializers.IntegerField()
    answer_id = serializers.IntegerField()


class SaveAnswerStoredSerializer(serializers.Serializer):
    answer_id = serializers.IntegerField()


@extend_schema_serializer(component_name="AssessmentAttemptBundleResponse")
class AttemptBundleResponseSerializer(serializers.Serializer):
    attempt = AttemptSerializer()
    set = AssessmentSetSerializer()
    questions = AssessmentQuestionSerializer(many=True)


@extend_schema_serializer(component_name="AssessmentSubmitQueuedResponse")
class SubmitAttemptQueuedResponseSerializer(serializers.Serializer):
    """Async grading accepted; poll `my-result` or re-fetch bundle for graded state."""

    attempt = AttemptSerializer()
    result = ResultSerializer(required=True, allow_null=True)
    grading = serializers.ChoiceField(choices=[("pending", "Pending")])


@extend_schema_serializer(component_name="AssessmentSubmitCompleteResponse")
class SubmitAttemptCompleteResponseSerializer(serializers.Serializer):
    """Submit completed synchronously or idempotent replay of submitted/graded attempt."""

    attempt = AttemptSerializer()
    result = ResultSerializer(required=False, allow_null=True)


@extend_schema_serializer(component_name="AssessmentSnapshotConflictResponse")
class SubmitAssessmentVersionConflictSerializer(serializers.Serializer):
    detail = serializers.CharField()


@extend_schema_serializer(component_name="AssessmentSubmitBadRequestResponse")
class SubmitAttemptBadRequestSerializer(serializers.Serializer):
    detail = serializers.CharField()
    missing_question_ids = serializers.ListField(child=serializers.IntegerField(), required=False)


@extend_schema_serializer(component_name="AssessmentMyResultResponse")
class MyAssessmentResultResponseSerializer(serializers.Serializer):
    attempt = AttemptSerializer(required=True, allow_null=True)
    result = ResultSerializer(required=True, allow_null=True)

