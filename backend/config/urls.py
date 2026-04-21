from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.conf import settings
from django.conf.urls.static import static

from users.views import ThrottledTokenObtainPairView

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/auth/login/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/users/', include('users.urls')),
    path('api/exams/', include('exams.urls')),
    path('api/classes/', include('classes.urls')),
    path('api/access/', include('access.urls')),
    path('api/realtime/', include('realtime.urls')),
    path('api/vocabulary/', include('vocabulary.urls')),
    path('api/assessments/', include('assessments.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
