from django.urls import path

from .views import RealtimeEventsSSEView, RealtimeMetricsView, RealtimePrometheusMetricsView


urlpatterns = [
    path("events/", RealtimeEventsSSEView.as_view(), name="realtime-events"),
    path("metrics/", RealtimeMetricsView.as_view(), name="realtime-metrics"),
    path("metrics/prometheus/", RealtimePrometheusMetricsView.as_view(), name="realtime-metrics-prometheus"),
]

