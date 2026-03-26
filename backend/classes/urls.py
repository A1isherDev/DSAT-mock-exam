from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ClassroomViewSet, JoinClassView, ClassPostViewSet, AssignmentViewSet, SubmissionAdminViewSet


router = DefaultRouter()
router.register(r"", ClassroomViewSet, basename="classroom")

posts_router = DefaultRouter()
posts_router.register(r"", ClassPostViewSet, basename="class-posts")

assignments_router = DefaultRouter()
assignments_router.register(r"", AssignmentViewSet, basename="class-assignments")

submissions_router = DefaultRouter()
submissions_router.register(r"", SubmissionAdminViewSet, basename="class-submissions")


urlpatterns = [
    path("join/", JoinClassView.as_view(), name="class-join"),
    path("submissions/", include(submissions_router.urls)),
    path("<int:classroom_pk>/posts/", include(posts_router.urls)),
    path("<int:classroom_pk>/assignments/", include(assignments_router.urls)),
    path("", include(router.urls)),
]

