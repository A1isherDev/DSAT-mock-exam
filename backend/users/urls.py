from django.urls import path
from .views import (
    UserListView,
    UserCreateView,
    UserUpdateView,
    UserDeleteView,
    UserRegistrationView,
    UserMeView,
    GoogleAuthView,
    TelegramAuthView,
    TelegramWidgetConfigView,
    TelegramLinkView,
)

urlpatterns = [
    path('me/', UserMeView.as_view(), name='user-me'),
    path('register/', UserRegistrationView.as_view(), name='user-register'),
    path('google/', GoogleAuthView.as_view(), name='google-auth'),
    path('telegram/config/', TelegramWidgetConfigView.as_view(), name='telegram-widget-config'),
    path('telegram/link/', TelegramLinkView.as_view(), name='telegram-link'),
    path('telegram/', TelegramAuthView.as_view(), name='telegram-auth'),
    path('', UserListView.as_view(), name='user-list'),
    path('create/', UserCreateView.as_view(), name='user-create'),
    path('<int:pk>/update/', UserUpdateView.as_view(), name='user-update'),
    path('<int:pk>/delete/', UserDeleteView.as_view(), name='user-delete'),
]
