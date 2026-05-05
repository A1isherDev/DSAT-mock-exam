from django.contrib import admin

from .models import (
    AuditLog,
    MockExam,
    Module,
    ModuleQuestion,
    PastpaperPack,
    PortalMockExam,
    PracticeTest,
    Question,
    TestAttempt,
)

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "question_type", "get_test_title", "module_count")
    list_filter = ("question_type",)
    search_fields = ('question_text',)
    list_per_page = 50

    fieldsets = (
        ('Content', {
            'fields': ('question_type', 'question_text', 'question_prompt', 'question_image')
        }),
        ('Options', {
            'fields': ('option_a', 'option_b', 'option_c', 'option_d')
        }),
        ('Correct Answer', {
            'fields': ('correct_answers', 'is_math_input', 'explanation')
        }),
    )

    def get_test_title(self, obj):
        link = ModuleQuestion.objects.select_related("module__practice_test__mock_exam").filter(question=obj).order_by("order", "id").first()
        if link and link.module and link.module.practice_test and link.module.practice_test.mock_exam:
            return link.module.practice_test.mock_exam.title
        return "Unassigned"
    get_test_title.short_description = 'Mock Exam'

    def module_count(self, obj):
        return ModuleQuestion.objects.filter(question=obj).count()
    module_count.short_description = "Modules"

class ModuleInline(admin.StackedInline):
    model = Module
    extra = 0
    show_change_link = True

class PracticeTestInline(admin.StackedInline):
    model = PracticeTest
    extra = 0
    show_change_link = True


class PortalMockExamInline(admin.StackedInline):
    model = PortalMockExam
    extra = 0
    max_num = 1
    filter_horizontal = ("assigned_users",)


@admin.register(MockExam)
class MockExamAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "practice_date", "is_published", "is_active")
    list_filter = ("is_active", "kind", "practice_date")
    search_fields = ("title",)
    filter_horizontal = ("assigned_users",)
    inlines = [PortalMockExamInline, PracticeTestInline]
    list_per_page = 50
    fieldsets = (
        (None, {"fields": ("title", "practice_date", "is_active", "kind", "assigned_users")}),
        (
            "Midterm options (when kind = Midterm)",
            {
                "fields": (
                    "midterm_subject",
                    "midterm_module_count",
                    "midterm_module1_minutes",
                    "midterm_module2_minutes",
                    "midterm_target_question_count",
                )
            },
        ),
    )


class PastpaperSectionInline(admin.TabularInline):
    model = PracticeTest
    fk_name = "pastpaper_pack"
    extra = 0
    show_change_link = True


@admin.register(PastpaperPack)
class PastpaperPackAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "practice_date", "form_type", "label")
    list_filter = ("form_type",)
    search_fields = ("title",)
    inlines = [PastpaperSectionInline]


@admin.register(PortalMockExam)
class PortalMockExamAdmin(admin.ModelAdmin):
    list_display = ("id", "mock_exam", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("mock_exam__title",)
    autocomplete_fields = ("mock_exam",)
    filter_horizontal = ("assigned_users",)


@admin.register(PracticeTest)
class PracticeTestAdmin(admin.ModelAdmin):
    list_display = ('id', 'mock_exam', 'subject')
    list_filter = ('subject', 'mock_exam')
    search_fields = ('mock_exam__title',)
    inlines = [ModuleInline]
    list_per_page = 50

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('id', 'practice_test', 'module_order')
    list_filter = ('practice_test__subject', 'module_order')
    search_fields = ('practice_test__mock_exam__title',)
    autocomplete_fields = ['practice_test']
    list_select_related = ('practice_test',)
    list_per_page = 50

@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'practice_test', 'is_completed', 'score')
    list_filter = ('is_completed', 'practice_test__subject')
    autocomplete_fields = ['practice_test', 'student', 'current_module']
    search_fields = ('student__email',)
    list_select_related = ('student', 'practice_test')
    list_per_page = 50

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'user', 'action', 'details')
    list_filter = ('action', 'timestamp')
    search_fields = ('user__email', 'action', 'details')
    readonly_fields = ('timestamp',)
    list_select_related = ('user',)
    list_per_page = 100
