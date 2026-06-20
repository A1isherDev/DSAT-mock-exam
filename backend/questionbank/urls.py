"""Question Bank admin API routes (read-only, Phase A). Mounted at api/questionbank/."""
from django.urls import path

from . import views

app_name = "questionbank"

urlpatterns = [
    path("questions/", views.BankQuestionListView.as_view(), name="question-list"),
    path("questions/<int:pk>/", views.BankQuestionDetailView.as_view(), name="question-detail"),
    path("passages/", views.BankPassageListView.as_view(), name="passage-list"),
    path("passages/<int:pk>/", views.BankPassageDetailView.as_view(), name="passage-detail"),
    path("versions/", views.BankQuestionVersionListView.as_view(), name="version-list"),
    path("domains/", views.BankDomainListView.as_view(), name="domain-list"),
    path("skills/", views.BankSkillListView.as_view(), name="skill-list"),
]
