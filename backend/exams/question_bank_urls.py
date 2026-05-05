from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminCategoryViewSet, AdminStandaloneQuestionViewSet


categories_router = DefaultRouter()
categories_router.register(r"", AdminCategoryViewSet, basename="question-bank-categories")

questions_router = DefaultRouter()
questions_router.register(r"", AdminStandaloneQuestionViewSet, basename="question-bank-questions")


urlpatterns = [
    path("categories/", include(categories_router.urls)),
    path("questions/", include(questions_router.urls)),
]

