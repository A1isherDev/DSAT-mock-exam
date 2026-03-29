from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MockExamViewSet,
    PracticeTestViewSet,
    TestAttemptViewSet,
    AdminMockExamViewSet,
    AdminPastpaperPackViewSet,
    AdminPracticeTestViewSet,
    AdminModuleViewSet,
    AdminQuestionViewSet,
)

# ── Student routes ──────────────────────────────────────────────────────────
router = DefaultRouter()
router.register(r'attempts', TestAttemptViewSet, basename='test-attempt')
router.register(r'mock-exams', MockExamViewSet, basename='mock-exam')
router.register(r'', PracticeTestViewSet, basename='practice-test')

# ── Admin routes (manual nested) ────────────────────────────────────────────
admin_mock_exam_router = DefaultRouter()
admin_mock_exam_router.register(r'', AdminMockExamViewSet, basename='admin-mock-exams')

admin_pastpaper_pack_router = DefaultRouter()
admin_pastpaper_pack_router.register(r'', AdminPastpaperPackViewSet, basename='admin-pastpaper-packs')

admin_test_router = DefaultRouter()
admin_test_router.register(r'', AdminPracticeTestViewSet, basename='admin-tests')

admin_module_router = DefaultRouter()
admin_module_router.register(r'', AdminModuleViewSet, basename='admin-modules')

admin_question_router = DefaultRouter()
admin_question_router.register(r'', AdminQuestionViewSet, basename='admin-questions')

urlpatterns = [
    # Admin Questions CRUD: /exams/admin/tests/<test_pk>/modules/<module_pk>/questions/
    path('admin/tests/<int:test_pk>/modules/<int:module_pk>/questions/', include(admin_question_router.urls)),
    
    # Admin Modules CRUD: /exams/admin/tests/<test_pk>/modules/
    path('admin/tests/<int:test_pk>/modules/', include(admin_module_router.urls)),

    # Admin Tests CRUD: /exams/admin/tests/
    path('admin/tests/', include(admin_test_router.urls)),

    # Admin Mock Exams CRUD: /exams/admin/mock-exams/
    path('admin/mock-exams/', include(admin_mock_exam_router.urls)),

    # Admin Pastpaper packs: /exams/admin/pastpaper-packs/
    path('admin/pastpaper-packs/', include(admin_pastpaper_pack_router.urls)),

    # Student / Common routes
    path('', include(router.urls)),
]
