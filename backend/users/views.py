import logging

from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Prefetch, Q
from .models import ExamDateOption, User
from classes.models import Classroom, ClassroomMembership
from access import constants as acc_const
from access.permissions import HasManageUsers, HasManageUsersOrAssignTestAccess
from access.services import (
    authorize,
    get_effective_permission_codenames,
    normalized_role,
    platform_subject_for_user,
    user_domain_subject,
)

from .serializers import (
    ExamDateOptionPublicSerializer,
    ExamDateOptionSerializer,
    UserSerializer,
    UserMeSerializer,
    MyTokenObtainPairSerializer,
)
from .permissions import IsAuthenticatedAndNotFrozen
from django.conf import settings
import re

from .telegram_auth import verify_telegram_login
from .phone_utils import normalize_phone
from .telegram_bot_info import telegram_bot_username_for_token

logger = logging.getLogger("security.users")


def _subject_for_auth_response(user: User) -> str:
    """Domain subject for staff (math|english); empty for students without subject."""
    return getattr(user, "subject", None) or ""


def _prefetch_user_directory(qs):
    """Avoid N+1 when serializing ``bulk_assign_profile`` for list views."""
    return qs.prefetch_related(
        "access_grants",
        Prefetch(
            "class_memberships",
            queryset=ClassroomMembership.objects.filter(role=ClassroomMembership.ROLE_STUDENT).select_related(
                "classroom"
            ),
        ),
    )


def _apply_telegram_phone(user, data) -> Response | None:
    """Persist verified phone from Telegram payload; return error Response or None."""
    raw_phone = data.get("phone_number")
    if raw_phone is None or not str(raw_phone).strip():
        return None
    try:
        normalized = normalize_phone(raw_phone)
    except ValueError:
        return Response({"detail": "Invalid phone number."}, status=status.HTTP_400_BAD_REQUEST)
    if not normalized:
        return None
    if User.objects.filter(phone_number=normalized).exclude(pk=user.pk).exists():
        return Response(
            {"detail": "This phone number is already in use."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.phone_number = normalized
    user.save(update_fields=["phone_number"])
    return None


def _effective_telegram_bot_username() -> str:
    u = getattr(settings, "TELEGRAM_BOT_USERNAME", "") or ""
    if u:
        return u
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
    if not token:
        return ""
    return telegram_bot_username_for_token(token)

class ThrottledTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    throttle_scope = 'sustained'

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsersOrAssignTestAccess]

    def get_queryset(self):
        qs = User.objects.all().order_by("-date_joined")
        user = self.request.user
        actor_subj = platform_subject_for_user(user)
        # Full user directory: only user managers. Teachers with assign_test_access get students only (bulk assign).
        if authorize(user, acc_const.PERM_MANAGE_USERS, subject=actor_subj):
            if getattr(user, "is_superuser", False) or normalized_role(user) == acc_const.ROLE_SUPER_ADMIN:
                return _prefetch_user_directory(qs)
            dom = user_domain_subject(user)
            if not dom:
                raise PermissionDenied(
                    detail="A valid subject (math or english) is required to list users for this account."
                )
            clsub = (
                Classroom.SUBJECT_MATH
                if dom == acc_const.DOMAIN_MATH
                else Classroom.SUBJECT_ENGLISH
            )
            return _prefetch_user_directory(
                qs.filter(
                    Q(role=acc_const.ROLE_STUDENT)
                    & (
                        Q(access_grants__subject=dom)
                        | Q(class_memberships__classroom__subject=clsub)
                    )
                    | Q(
                        subject=dom,
                        role__in=[
                            acc_const.ROLE_TEACHER,
                            acc_const.ROLE_ADMIN,
                            acc_const.ROLE_TEST_ADMIN,
                        ],
                    )
                ).distinct()
            )
        if authorize(user, acc_const.PERM_ASSIGN_ACCESS, subject=actor_subj):
            dom = user_domain_subject(user)
            q = Q(role=acc_const.ROLE_STUDENT)
            if not dom:
                raise PermissionDenied(
                    detail="A valid subject (math or english) is required to list users for this account."
                )
            clsub = (
                Classroom.SUBJECT_MATH
                if dom == acc_const.DOMAIN_MATH
                else Classroom.SUBJECT_ENGLISH
            )
            q &= Q(access_grants__subject=dom) | Q(class_memberships__classroom__subject=clsub)
            return _prefetch_user_directory(qs.filter(q).distinct())
        return qs.none()

class UserCreateView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsers]

    def perform_create(self, serializer):
        user = serializer.save()
        actor = self.request.user
        logger.info(
            "user_created target_id=%s email=%s role=%s actor_id=%s is_superuser=%s",
            user.pk,
            user.email,
            user.role,
            getattr(actor, "pk", None),
            getattr(actor, "is_superuser", False)
            or normalized_role(actor) == acc_const.ROLE_SUPER_ADMIN,
        )


class UserUpdateView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [HasManageUsers]
    queryset = User.objects.all()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        inst = serializer.instance
        actor = self.request.user
        logger.info(
            "user_updated target_id=%s role=%s subject=%s actor_id=%s is_superuser=%s",
            inst.pk,
            inst.role,
            getattr(inst, "subject", None),
            getattr(actor, "pk", None),
            getattr(actor, "is_superuser", False)
            or normalized_role(actor) == acc_const.ROLE_SUPER_ADMIN,
        )


class UserDeleteView(generics.DestroyAPIView):
    permission_classes = [HasManageUsers]
    queryset = User.objects.all()

    def perform_destroy(self, instance):
        actor = self.request.user
        logger.info(
            "user_deleted target_id=%s email=%s actor_id=%s is_superuser=%s",
            instance.pk,
            instance.email,
            getattr(actor, "pk", None),
            getattr(actor, "is_superuser", False)
            or normalized_role(actor) == acc_const.ROLE_SUPER_ADMIN,
        )
        super().perform_destroy(instance)

class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [] # Allow any


class UserMeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserMeSerializer
    permission_classes = [IsAuthenticatedAndNotFrozen]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.user


class ExamDateOptionListView(generics.ListAPIView):
    """Active exam dates for student profile dropdown."""

    permission_classes = [IsAuthenticatedAndNotFrozen]
    serializer_class = ExamDateOptionPublicSerializer

    def get_queryset(self):
        return ExamDateOption.objects.filter(is_active=True).order_by("sort_order", "exam_date")


class ExamDateOptionAdminListCreateView(generics.ListCreateAPIView):
    permission_classes = [HasManageUsers]
    serializer_class = ExamDateOptionSerializer
    queryset = ExamDateOption.objects.all().order_by("sort_order", "exam_date")


class ExamDateOptionAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [HasManageUsers]
    serializer_class = ExamDateOptionSerializer
    queryset = ExamDateOption.objects.all()


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
                role=acc_const.ROLE_STUDENT,
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
                "subject": _subject_for_auth_response(user),
                "is_frozen": user.is_frozen,
                "permissions": sorted(get_effective_permission_codenames(user)),
            },
            status=status.HTTP_200_OK,
        )


class TelegramWidgetConfigView(APIView):
    """Public: whether Telegram login is configured and which bot username the widget needs."""

    permission_classes = []

    def get(self, request):
        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
        if not token:
            return Response({"enabled": False, "bot_username": None})
        username = _effective_telegram_bot_username()
        if not username:
            return Response({"enabled": False, "bot_username": None})
        return Response({"enabled": True, "bot_username": username})


class TelegramLinkView(APIView):
    """Link Telegram to the currently logged-in account (profile «Connect Telegram»)."""

    permission_classes = [IsAuthenticatedAndNotFrozen]

    def post(self, request):
        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
        if not token:
            return Response(
                {"detail": "Telegram is not configured on the server."},
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
        synthetic = f"tg{tg_id}@{domain}".lower()
        if User.objects.filter(Q(telegram_id=tg_id) | Q(email__iexact=synthetic)).exclude(pk=request.user.pk).exists():
            return Response(
                {"detail": "This Telegram account is already linked to another user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if user.telegram_id is not None and user.telegram_id != tg_id:
            return Response(
                {"detail": "Your account is already linked to a different Telegram account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        phone_err = _apply_telegram_phone(user, data)
        if phone_err is not None:
            return phone_err
        user.telegram_id = tg_id
        user.save(update_fields=["telegram_id"])
        return Response(UserMeSerializer(user, context={"request": request}).data, status=status.HTTP_200_OK)


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
                role=acc_const.ROLE_STUDENT,
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

        phone_err = _apply_telegram_phone(user, data)
        if phone_err is not None:
            return phone_err
        user.telegram_id = tg_id
        user.save(update_fields=["telegram_id"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "is_admin": user.is_admin,
                "role": user.role,
                "subject": _subject_for_auth_response(user),
                "is_frozen": user.is_frozen,
                "permissions": sorted(get_effective_permission_codenames(user)),
            },
            status=status.HTTP_200_OK,
        )
