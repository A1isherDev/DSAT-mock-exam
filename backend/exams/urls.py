from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import (
    AdminCategoryViewSet,
    AdminMockExamViewSet,
    AdminModuleViewSet,
    AdminPastpaperPackViewSet,
    AdminPracticeTestViewSet,
    AdminQuestionViewSet,
    AdminStandaloneQuestionViewSet,
    BulkAssignmentHistoryListView,
    BulkAssignmentHistoryDetailView,
    BulkAssignmentHistoryRerunView,
    MockExamViewSet,
    PracticeTestViewSet,
    TestAttemptViewSet,
    ExamsMetricsView,
    ExamsPrometheusMetricsView,
)

# ── Student routes ──────────────────────────────────────────────────────────
router = DefaultRouter()
router.register(r'attempts', TestAttemptViewSet, basename='test-attempt')
router.register(r'mock-exams', MockExamViewSet, basename='mock-exam')
#
# IMPORTANT: do NOT register the practice-test viewset at the empty prefix with DefaultRouter.
# The generated `/<pk>/` pattern (string pk) would match `/attempts/` and `/mock-exams/`,
# causing those endpoints to 404 by routing into PracticeTestViewSet.retrieve(pk="attempts").
# Instead, expose the practice library at the same API contract via explicit int-path routes.

# ── Admin routes (manual nested) ────────────────────────────────────────────
admin_mock_exam_router = DefaultRouter()
admin_mock_exam_router.register(r'', AdminMockExamViewSet, basename='admin-mock-exams')

admin_pastpaper_pack_router = DefaultRouter()
admin_pastpaper_pack_router.register(r'', AdminPastpaperPackViewSet, basename='admin-pastpaper-packs')

admin_test_router = DefaultRouter()
admin_test_router.register(r'', AdminPracticeTestViewSet, basename='admin-tests')

admin_category_router = DefaultRouter()
admin_category_router.register(r"", AdminCategoryViewSet, basename="admin-categories")

admin_module_router = DefaultRouter()
admin_module_router.register(r'', AdminModuleViewSet, basename='admin-modules')

admin_question_router = DefaultRouter()
admin_question_router.register(r'', AdminQuestionViewSet, basename='admin-questions')

admin_standalone_question_router = DefaultRouter()
admin_standalone_question_router.register(r"", AdminStandaloneQuestionViewSet, basename="admin-standalone-questions")

urlpatterns = [
    path("metrics/", ExamsMetricsView.as_view(), name="exams-metrics"),
    path("metrics/prometheus/", ExamsPrometheusMetricsView.as_view(), name="exams-metrics-prometheus"),
    path("assignments/history/", BulkAssignmentHistoryListView.as_view(), name="bulk-assignment-history"),
    path(
        "assignments/history/<int:pk>/",
        BulkAssignmentHistoryDetailView.as_view(),
        name="bulk-assignment-detail",
    ),
    path(
        "assignments/history/<int:pk>/rerun/",
        BulkAssignmentHistoryRerunView.as_view(),
        name="bulk-assignment-rerun",
    ),
    # Admin Questions CRUD: /exams/admin/tests/<test_pk>/modules/<module_pk>/questions/
    path('admin/tests/<int:test_pk>/modules/<int:module_pk>/questions/', include(admin_question_router.urls)),

    # Standalone question bank: /exams/admin/questions/?standalone=1
    path("admin/questions/", include(admin_standalone_question_router.urls)),

    # Categories: /exams/admin/categories/
    path("admin/categories/", include(admin_category_router.urls)),
    
    # Admin Modules CRUD: /exams/admin/tests/<test_pk>/modules/
    path('admin/tests/<int:test_pk>/modules/', include(admin_module_router.urls)),

    # Admin Tests CRUD: /exams/admin/tests/
    path('admin/tests/', include(admin_test_router.urls)),

    # Admin Mock Exams CRUD: /exams/admin/mock-exams/
    path('admin/mock-exams/', include(admin_mock_exam_router.urls)),

    # Admin Pastpaper packs: /exams/admin/pastpaper-packs/
    path('admin/pastpaper-packs/', include(admin_pastpaper_pack_router.urls)),

    # Student / Common routes
    # Bulk library assignment (must not be registered via DefaultRouter empty prefix — conflicts).
    path(
        "bulk_assign/",
        PracticeTestViewSet.as_view({"post": "bulk_assign"}),
        name="practice-test-bulk-assign",
    ),
    # Pastpaper practice library (explicit int-pk routes avoid router prefix conflicts)
    re_path(r"^$", PracticeTestViewSet.as_view({"get": "list"}), name="practice-test-list"),
    re_path(r"^(?P<pk>\\d+)/$", PracticeTestViewSet.as_view({"get": "retrieve"}), name="practice-test-detail"),
    path('', include(router.urls)),
]
