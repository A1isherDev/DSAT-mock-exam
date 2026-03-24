from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import UserSerializer, MyTokenObtainPairSerializer
import re

class ThrottledTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    throttle_scope = 'sustained'

class IsAdminUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and getattr(request.user, 'is_admin', False))

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]
    queryset = User.objects.all().order_by('-date_joined')

class UserCreateView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]

class UserUpdateView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]
    queryset = User.objects.all()

class UserDeleteView(generics.DestroyAPIView):
    permission_classes = [IsAdminUser]
    queryset = User.objects.all()

class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserSerializer
    permission_classes = [] # Allow any


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

        try:
            payload = id_token.verify_oauth2_token(credential, google_requests.Request())
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
            },
            status=status.HTTP_200_OK,
        )
