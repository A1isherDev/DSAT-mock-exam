from django.contrib import admin

from .models import VocabularyWord, UserVocabularyProgress, UserVocabularyReviewEvent


@admin.register(VocabularyWord)
class VocabularyWordAdmin(admin.ModelAdmin):
    list_display = ("id", "word", "part_of_speech", "difficulty", "created_at")
    search_fields = ("word", "meaning", "example")
    list_filter = ("part_of_speech", "difficulty", "created_at")


@admin.register(UserVocabularyProgress)
class UserVocabularyProgressAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "word",
        "status",
        "correct_count",
        "wrong_count",
        "interval_days",
        "next_review_at",
        "last_reviewed",
    )
    search_fields = ("user__email", "user__username", "word__word")
    list_filter = ("status", "next_review_at", "last_reviewed")


@admin.register(UserVocabularyReviewEvent)
class UserVocabularyReviewEventAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "word", "result", "reviewed_at")
    search_fields = ("user__email", "user__username", "word__word")
    list_filter = ("result", "reviewed_at")

