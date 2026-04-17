from django.urls import path

from .views import GrantAccessView

urlpatterns = [
    path("grant/", GrantAccessView.as_view(), name="access_grant"),
]
