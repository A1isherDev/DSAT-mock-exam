from django.urls import path

from .views import (
    AdminAssessmentSetListCreateView,
    AdminAssessmentSetDetailView,
    AdminAssessmentQuestionCreateView,
    AdminAssessmentQuestionDetailView,
    AssignAssessmentHomeworkView,
    StartAttemptView,
    SaveAnswerView,
    SubmitAttemptView,
    AbandonAttemptView,
    MyAssessmentResultForAssignmentView,
    AdminGradingMetricsView,
    AdminGradingPrometheusMetricsView,
    AdminAttemptStatusView,
    AdminRequeueAttemptView,
    AdminForceGradeAttemptView,
)


urlpatterns = [
    # Admin authoring
    path("admin/sets/", AdminAssessmentSetListCreateView.as_view(), name="assessment-admin-sets"),
    path("admin/sets/<int:pk>/", AdminAssessmentSetDetailView.as_view(), name="assessment-admin-set-detail"),
    path("admin/sets/<int:set_pk>/questions/", AdminAssessmentQuestionCreateView.as_view(), name="assessment-admin-question-create"),
    path("admin/questions/<int:pk>/", AdminAssessmentQuestionDetailView.as_view(), name="assessment-admin-question-detail"),
    # Admin grading controls / metrics
    path("admin/grading/metrics/", AdminGradingMetricsView.as_view(), name="assessment-admin-grading-metrics"),
    path(
        "admin/grading/metrics/prometheus/",
        AdminGradingPrometheusMetricsView.as_view(),
        name="assessment-admin-grading-metrics-prometheus",
    ),
    path("admin/attempts/<int:attempt_id>/", AdminAttemptStatusView.as_view(), name="assessment-admin-attempt-status"),
    path("admin/attempts/<int:attempt_id>/requeue/", AdminRequeueAttemptView.as_view(), name="assessment-admin-attempt-requeue"),
    path("admin/attempts/<int:attempt_id>/force-grade/", AdminForceGradeAttemptView.as_view(), name="assessment-admin-attempt-force-grade"),
    # Teacher assign
    path("homework/assign/", AssignAssessmentHomeworkView.as_view(), name="assessment-homework-assign"),
    # Student attempt flow
    path("attempts/start/", StartAttemptView.as_view(), name="assessment-attempt-start"),
    path("attempts/answer/", SaveAnswerView.as_view(), name="assessment-attempt-answer"),
    path("attempts/submit/", SubmitAttemptView.as_view(), name="assessment-attempt-submit"),
    path("attempts/abandon/", AbandonAttemptView.as_view(), name="assessment-attempt-abandon"),
    # Student result (by assignment id)
    path("homework/<int:assignment_id>/my-result/", MyAssessmentResultForAssignmentView.as_view(), name="assessment-homework-my-result"),
]

