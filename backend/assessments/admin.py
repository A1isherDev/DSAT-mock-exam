from django.contrib import admin

from .models import (
    AssessmentSet,
    AssessmentQuestion,
    HomeworkAssignment,
    AssessmentAttempt,
    AssessmentAnswer,
    AssessmentResult,
    SecurityAlert,
)


@admin.register(AssessmentSet)
class AssessmentSetAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "category", "title", "is_active", "created_at")
    list_filter = ("subject", "is_active", "created_at")
    search_fields = ("title", "category", "description")


@admin.register(AssessmentQuestion)
class AssessmentQuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "assessment_set", "order", "question_type", "points", "is_active", "created_at")
    list_filter = ("question_type", "is_active")
    search_fields = ("prompt",)


@admin.register(HomeworkAssignment)
class HomeworkAssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "classroom", "assessment_set", "assignment", "assigned_by", "created_at")
    list_filter = ("created_at",)
    search_fields = ("assignment__title", "assessment_set__title", "classroom__name", "assigned_by__email")


@admin.register(AssessmentAttempt)
class AssessmentAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "homework", "student", "status", "started_at", "submitted_at", "total_time_seconds")
    list_filter = ("status", "started_at", "submitted_at")
    search_fields = ("student__email", "student__username")


@admin.register(AssessmentAnswer)
class AssessmentAnswerAdmin(admin.ModelAdmin):
    list_display = ("id", "attempt", "question", "is_correct", "points_awarded", "time_spent_seconds", "answered_at")
    list_filter = ("is_correct",)


@admin.register(AssessmentResult)
class AssessmentResultAdmin(admin.ModelAdmin):
    list_display = ("id", "attempt", "score_points", "max_points", "percent", "correct_count", "graded_at")
    list_filter = ("graded_at",)


@admin.register(SecurityAlert)
class SecurityAlertAdmin(admin.ModelAdmin):
    list_display = ("id", "alert_type", "source", "webhook_delivered", "email_delivered", "created_at")
    list_filter = ("source", "alert_type", "created_at")
    readonly_fields = ("fingerprint", "payload", "mitigation", "webhook_delivered", "email_delivered", "created_at")
    search_fields = ("fingerprint", "alert_type")

