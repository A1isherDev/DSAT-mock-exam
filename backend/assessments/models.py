from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class AssessmentSet(models.Model):
    SUBJECT_MATH = "math"
    SUBJECT_ENGLISH = "english"
    SUBJECT_CHOICES = [
        (SUBJECT_MATH, "Math"),
        (SUBJECT_ENGLISH, "English"),
    ]

    subject = models.CharField(max_length=16, choices=SUBJECT_CHOICES, db_index=True)
    category = models.CharField(max_length=255, db_index=True, blank=True, default="")
    title = models.CharField(max_length=200, db_index=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assessment_sets_created",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "assessment_sets"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subject", "category", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.subject}:{self.title}"


class AssessmentQuestion(models.Model):
    TYPE_MULTIPLE_CHOICE = "multiple_choice"
    TYPE_SHORT_TEXT = "short_text"
    TYPE_NUMERIC = "numeric"
    TYPE_BOOLEAN = "boolean"
    TYPE_CHOICES = [
        (TYPE_MULTIPLE_CHOICE, "Multiple choice"),
        (TYPE_SHORT_TEXT, "Short text"),
        (TYPE_NUMERIC, "Numeric"),
        (TYPE_BOOLEAN, "True/False"),
    ]

    assessment_set = models.ForeignKey(
        AssessmentSet,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    order = models.PositiveIntegerField(default=0, db_index=True)
    prompt = models.TextField()
    question_type = models.CharField(max_length=32, choices=TYPE_CHOICES, db_index=True)

    # For multiple choice: [{ "id": "A", "text": "..." }, ...]
    choices = models.JSONField(blank=True, default=list)

    # Correct answer can be a string/number/bool, or list of acceptable strings.
    correct_answer = models.JSONField(blank=True, default=None, null=True)
    grading_config = models.JSONField(blank=True, default=dict)  # e.g. tolerance for numeric

    points = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "assessment_questions"
        ordering = ["assessment_set_id", "order", "id"]
        indexes = [
            models.Index(fields=["assessment_set", "order"]),
        ]


class HomeworkAssignment(models.Model):
    """
    Teacher assigns an AssessmentSet as homework.

    Integrates with existing class homework feed via a linked `classes.Assignment` row.
    """

    classroom = models.ForeignKey(
        "classes.Classroom",
        on_delete=models.CASCADE,
        related_name="assessment_homework",
    )
    assessment_set = models.ForeignKey(
        AssessmentSet,
        on_delete=models.PROTECT,
        related_name="homework_assignments",
    )
    assignment = models.OneToOneField(
        "classes.Assignment",
        on_delete=models.CASCADE,
        related_name="assessment_homework",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assessment_homework_assigned",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assessment_homework_assignments"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["classroom", "assignment"], name="uniq_assessment_hw_class_assignment"),
        ]


class AssessmentHomeworkAuditEvent(models.Model):
    EVENT_ASSIGNED = "assigned"

    EVENT_CHOICES = [
        (EVENT_ASSIGNED, "Assigned"),
    ]

    classroom = models.ForeignKey(
        "classes.Classroom",
        on_delete=models.CASCADE,
        related_name="assessment_homework_audit_events",
    )
    assessment_set = models.ForeignKey(
        AssessmentSet,
        on_delete=models.PROTECT,
        related_name="homework_audit_events",
    )
    homework = models.ForeignKey(
        HomeworkAssignment,
        on_delete=models.CASCADE,
        related_name="audit_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assessment_homework_audit_events",
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assessment_homework_audit_events"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["classroom", "created_at"]),
            models.Index(fields=["assessment_set", "created_at"]),
            models.Index(fields=["event_type", "created_at"]),
        ]


class SecurityAlert(models.Model):
    """
    Durable record of security/ops alerts for post-incident analysis and webhook replay.
    """

    SOURCE_HOMEWORK_ABUSE = "homework_abuse"
    SOURCE_HOMEWORK_ABUSE_DB = "homework_abuse_db"
    SOURCE_SLO = "slo"
    SOURCE_CHOICES = [
        (SOURCE_HOMEWORK_ABUSE, "Homework abuse"),
        (SOURCE_HOMEWORK_ABUSE_DB, "Homework abuse (DB)"),
        (SOURCE_SLO, "SLO"),
    ]

    alert_type = models.CharField(max_length=80, db_index=True)
    source = models.CharField(max_length=40, db_index=True, choices=SOURCE_CHOICES, default=SOURCE_HOMEWORK_ABUSE)
    fingerprint = models.CharField(max_length=512, db_index=True, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    mitigation = models.JSONField(null=True, blank=True)
    webhook_delivered = models.BooleanField(default=False)
    email_delivered = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assessment_security_alerts"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["alert_type", "created_at"]),
            models.Index(fields=["source", "created_at"]),
        ]


# NOTE: module-level constants so constraints can reference them safely
# during class construction (Meta is evaluated before the class name exists).
ASSESSMENT_ATTEMPT_STATUS_IN_PROGRESS = "in_progress"
ASSESSMENT_ATTEMPT_STATUS_SUBMITTED = "submitted"
ASSESSMENT_ATTEMPT_STATUS_GRADED = "graded"
ASSESSMENT_ATTEMPT_STATUS_ABANDONED = "abandoned"


class AssessmentAttempt(models.Model):
    STATUS_IN_PROGRESS = ASSESSMENT_ATTEMPT_STATUS_IN_PROGRESS
    STATUS_SUBMITTED = ASSESSMENT_ATTEMPT_STATUS_SUBMITTED
    STATUS_GRADED = ASSESSMENT_ATTEMPT_STATUS_GRADED
    STATUS_ABANDONED = ASSESSMENT_ATTEMPT_STATUS_ABANDONED
    STATUS_CHOICES = [
        (STATUS_IN_PROGRESS, "In progress"),
        (STATUS_SUBMITTED, "Submitted"),
        (STATUS_GRADED, "Graded"),
        (STATUS_ABANDONED, "Abandoned"),
    ]

    homework = models.ForeignKey(
        HomeworkAssignment,
        on_delete=models.CASCADE,
        related_name="attempts",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assessment_attempts",
    )
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS, db_index=True)
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    abandoned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_activity_at = models.DateTimeField(null=True, blank=True, db_index=True)
    total_time_seconds = models.PositiveIntegerField(default=0)
    active_time_seconds = models.PositiveIntegerField(default=0)
    # Async grading status
    GRADING_PENDING = "pending"
    GRADING_PROCESSING = "processing"
    GRADING_COMPLETED = "completed"
    GRADING_FAILED = "failed"
    GRADING_STATUS_CHOICES = [
        (GRADING_PENDING, "Pending"),
        (GRADING_PROCESSING, "Processing"),
        (GRADING_COMPLETED, "Completed"),
        (GRADING_FAILED, "Failed"),
    ]
    grading_status = models.CharField(
        max_length=24,
        choices=GRADING_STATUS_CHOICES,
        default=GRADING_PENDING,
        db_index=True,
    )
    grading_attempts = models.PositiveIntegerField(default=0)
    grading_error = models.TextField(blank=True, default="")
    grading_last_attempt_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Stable question shuffle per attempt (list of AssessmentQuestion ids).
    question_order = models.JSONField(blank=True, default=list)

    class Meta:
        db_table = "assessment_attempts"
        ordering = ["-started_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["homework", "student"],
                condition=models.Q(status=ASSESSMENT_ATTEMPT_STATUS_IN_PROGRESS),
                name="uniq_active_attempt_per_hw_student_in_progress",
            ),
        ]
        indexes = [
            models.Index(fields=["student", "homework", "status"]),
            models.Index(fields=["student", "status", "started_at"]),
        ]

    def lock_reason(self) -> str | None:
        if self.status in (self.STATUS_SUBMITTED, self.STATUS_GRADED):
            return "submitted"
        if self.status == self.STATUS_ABANDONED:
            return "abandoned"
        return None


class AssessmentAttemptAuditEvent(models.Model):
    EVENT_STARTED = "started"
    EVENT_ANSWER_SAVED = "answer_saved"
    EVENT_SUBMITTED = "submitted"
    EVENT_GRADED = "graded"
    EVENT_ABANDONED = "abandoned"
    EVENT_TIMEOUT_ABANDONED = "timeout_abandoned"

    EVENT_CHOICES = [
        (EVENT_STARTED, "Started"),
        (EVENT_ANSWER_SAVED, "Answer saved"),
        (EVENT_SUBMITTED, "Submitted"),
        (EVENT_GRADED, "Graded"),
        (EVENT_ABANDONED, "Abandoned"),
        (EVENT_TIMEOUT_ABANDONED, "Timeout abandoned"),
    ]

    attempt = models.ForeignKey(
        AssessmentAttempt,
        on_delete=models.CASCADE,
        related_name="audit_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assessment_audit_events",
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assessment_attempt_audit_events"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["attempt", "created_at"]),
            models.Index(fields=["event_type", "created_at"]),
        ]


class AssessmentAnswer(models.Model):
    attempt = models.ForeignKey(
        AssessmentAttempt,
        on_delete=models.CASCADE,
        related_name="answers",
    )
    question = models.ForeignKey(
        AssessmentQuestion,
        on_delete=models.PROTECT,
        related_name="answers",
    )
    answer = models.JSONField(blank=True, default=None, null=True)
    # Server-computed time based on first/last save timestamps (do not trust client).
    time_spent_seconds = models.PositiveIntegerField(default=0)
    first_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_correct = models.BooleanField(null=True, blank=True, db_index=True)
    points_awarded = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Client-provided monotonic sequence for conflict detection (multi-tab / out-of-order protection).
    client_seq = models.BigIntegerField(default=0, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "assessment_answers"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="uniq_answer_per_attempt_question"),
        ]


class AssessmentResult(models.Model):
    attempt = models.OneToOneField(
        AssessmentAttempt,
        on_delete=models.CASCADE,
        related_name="result",
    )
    score_points = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_points = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    percent = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    correct_count = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    graded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "assessment_results"
        ordering = ["-graded_at", "-id"]
