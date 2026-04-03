from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from access.permissions import HasManageUsers
from access.services import get_effective_permission_codenames

from .serializers import UserSerializer, UserMeSerializer, MyTokenObtainPairSerializer
from .permissions import IsAuthenticatedAndNotFrozen
from django.conf import settings
import re

from .telegram_auth import verify_telegram_login
from .phone_utils import normalize_phone

class ThrottledTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    throttle_scope = 'sustained'

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsers]
    queryset = User.objects.select_related("system_role").all().order_by("-date_joined")

class UserCreateView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsers]

class UserUpdateView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsers]
    queryset = User.objects.all()

class UserDeleteView(generics.DestroyAPIView):
    permission_classes = [HasManageUsers]
    queryset = User.objects.all()

class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [] # Allow any


class UserMeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserMeSerializer
    permission_classes = [IsAuthenticatedAndNotFrozen]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.user


class GoogleAuthView(APIView):
    permission_classes = []

    def post(self, request):
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests
        except Exception:
            return Response(
                {"detail": "Google auth dependencies are not installed on server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        credential = request.data.get("credential")
        if not credential:
            return Response({"detail": "Missing Google credential."}, status=status.HTTP_400_BAD_REQUEST)

        audience = settings.GOOGLE_CLIENT_ID or None
        try:
            payload = id_token.verify_oauth2_token(credential, google_requests.Request(), audience=audience)
        except Exception:
            return Response({"detail": "Invalid Google token."}, status=status.HTTP_400_BAD_REQUEST)

        email = (payload.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Google account has no email."}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get("email_verified") is False:
            return Response({"detail": "Google email is not verified."}, status=status.HTTP_400_BAD_REQUEST)

        first_name = (request.data.get("first_name") or payload.get("given_name") or "").strip()
        last_name = (request.data.get("last_name") or payload.get("family_name") or "").strip()
        username = (request.data.get("username") or "").strip()

        missing_fields = []
        if len(first_name) < 3:
            missing_fields.append("first_name")
        if len(last_name) < 3:
            missing_fields.append("last_name")

        if missing_fields:
            return Response(
                {
                    "detail": "Missing required profile fields.",
                    "missing_fields": missing_fields,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            if username and len(username) < 3:
                return Response({"detail": "Username must be at least 3 characters."}, status=status.HTTP_400_BAD_REQUEST)

            if not username:
                local = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0]) or "student"
                base = local[:30]
                candidate = base
                i = 1
                while User.objects.filter(username__iexact=candidate).exists():
                    candidate = f"{base}{i}"
                    i += 1
                username = candidate
            elif User.objects.filter(username__iexact=username).exists():
                return Response({"detail": "Username already exists."}, status=status.HTTP_400_BAD_REQUEST)

            user = User.objects.create_user(
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                role="STUDENT",
                password=User.objects.make_random_password(),
            )
        else:
            updated = False
            if not user.first_name and first_name:
                user.first_name = first_name
                updated = True
            if not user.last_name and last_name:
                user.last_name = last_name
                updated = True
            if updated:
                user.save(update_fields=["first_name", "last_name"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "is_admin": user.is_admin,
                "role": user.role,
                "is_frozen": user.is_frozen,
                "permissions": sorted(get_effective_permission_codenames(user)),
            },
            status=status.HTTP_200_OK,
        )


class TelegramAuthView(APIView):
    """Telegram Login (oauth embed): verify HMAC, optional verified ``phone_number`` from Telegram, issue JWT."""

    permission_classes = []

    def post(self, request):
        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
        if not token:
            return Response(
                {"detail": "Telegram sign-in is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        data = request.data
        if not verify_telegram_login(data, token):
            return Response({"detail": "Invalid or expired Telegram sign-in."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tg_id = int(data.get("id"))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid Telegram user id."}, status=status.HTTP_400_BAD_REQUEST)

        domain = getattr(settings, "TELEGRAM_SYNTHETIC_EMAIL_DOMAIN", "telegram.mastersat.local")
        email = f"tg{tg_id}@{domain}".lower()

        raw_fn = (str(data.get("first_name") or "")).strip()
        raw_ln = (str(data.get("last_name") or "")).strip()
        first_name = raw_fn if len(raw_fn) >= 3 else "Telegram"
        last_name = raw_ln if len(raw_ln) >= 3 else (first_name if len(first_name) >= 3 else "User")
        if len(last_name) < 3:
            last_name = "User"

        tg_username = (str(data.get("username") or "")).strip()
        username = (request.data.get("username") or "").strip()
        if username and len(username) < 3:
            return Response({"detail": "Username must be at least 3 characters."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            if not username:
                if tg_username and len(tg_username) >= 3:
                    candidate = tg_username[:30]
                else:
                    base = f"tg{tg_id}"[:25]
                    candidate = base
                    i = 1
                    while User.objects.filter(username__iexact=candidate).exists():
                        suffix = str(i)
                        candidate = (base[: max(1, 30 - len(suffix))] + suffix)[:30]
                        i += 1
                username = candidate
            elif User.objects.filter(username__iexact=username).exists():
                return Response({"detail": "Username already exists."}, status=status.HTTP_400_BAD_REQUEST)

            user = User.objects.create_user(
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                role="STUDENT",
                password=User.objects.make_random_password(),
            )
        else:
            updated = False
            if not user.first_name.strip() and raw_fn and len(raw_fn) >= 3:
                user.first_name = raw_fn
                updated = True
            if not user.last_name.strip() and raw_ln and len(raw_ln) >= 3:
                user.last_name = raw_ln
                updated = True
            if updated:
                user.save(update_fields=["first_name", "last_name"])

        raw_phone = request.data.get("phone_number")
        if raw_phone is not None and str(raw_phone).strip():
            try:
                normalized = normalize_phone(raw_phone)
            except ValueError:
                return Response({"detail": "Invalid phone number."}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.filter(phone_number=normalized).exclude(pk=user.pk).exists():
                return Response(
                    {"detail": "This phone number is already in use."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.phone_number = normalized
            user.save(update_fields=["phone_number"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "is_admin": user.is_admin,
                "role": user.role,
                "is_frozen": user.is_frozen,
                "permissions": sorted(get_effective_permission_codenames(user)),
            },
            status=status.HTTP_200_OK,
        )
