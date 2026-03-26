from django.contrib import admin

from .models import Classroom, ClassroomMembership, ClassPost, Assignment, Submission, Grade


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "subject", "lesson_days", "lesson_time", "room_number", "join_code", "is_active", "created_at")
    search_fields = ("name", "subject", "lesson_time", "room_number", "join_code")
    list_filter = ("is_active", "created_at")


@admin.register(ClassroomMembership)
class ClassroomMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "classroom", "user", "role", "joined_at")
    search_fields = ("classroom__name", "user__email", "user__username")
    list_filter = ("role", "joined_at")


@admin.register(ClassPost)
class ClassPostAdmin(admin.ModelAdmin):
    list_display = ("id", "classroom", "author", "created_at")
    search_fields = ("classroom__name", "author__email")
    list_filter = ("created_at",)


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "classroom", "title", "due_at", "created_at")
    search_fields = ("title", "classroom__name")
    list_filter = ("created_at",)


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "assignment", "student", "status", "submitted_at", "updated_at")
    search_fields = ("assignment__title", "student__email")
    list_filter = ("status", "submitted_at")


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("id", "submission", "graded_by", "score", "graded_at")
    search_fields = ("submission__assignment__title", "submission__student__email", "graded_by__email")
    list_filter = ("graded_at",)

