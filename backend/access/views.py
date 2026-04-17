from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from access import constants as C
from access.models import UserAccess
from access.services import (
    authorize,
    has_access_for_classroom,
    has_global_subject_access,
    normalized_role,
    user_domain_subject,
)
from access.subject_mapping import domain_subject_to_platform

User = get_user_model()
logger = logging.getLogger("security.access")


class GrantAccessView(APIView):
    """
    POST /api/access/grant/
    Body: { "userId": <int>, "subject": "math"|"english", "classroomId": <int|null> }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor_role = normalized_role(request.user)
        if actor_role not in (C.ROLE_SUPER_ADMIN, C.ROLE_ADMIN, C.ROLE_TEACHER):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        subject = str(request.data.get("subject") or "").strip().lower()
        if subject not in C.ALL_DOMAIN_SUBJECTS:
            return Response({"detail": "Invalid subject."}, status=status.HTTP_400_BAD_REQUEST)

        platform_subj = domain_subject_to_platform(subject)
        if not platform_subj:
            return Response({"detail": "Invalid subject."}, status=status.HTTP_400_BAD_REQUEST)

        if not authorize(request.user, C.PERM_ASSIGN_ACCESS, subject=platform_subj):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        raw_uid = request.data.get("userId", request.data.get("user_id"))
        try:
            uid = int(raw_uid)
        except (TypeError, ValueError):
            return Response({"detail": "userId is required."}, status=status.HTTP_400_BAD_REQUEST)

        if actor_role != C.ROLE_SUPER_ADMIN and user_domain_subject(request.user) != subject:
            return Response({"detail": "Subject mismatch."}, status=status.HTTP_403_FORBIDDEN)

        classroom_id = request.data.get("classroomId", request.data.get("classroom_id"))
        cid = None
        if classroom_id not in (None, "", "null"):
            try:
                cid = int(classroom_id)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid classroomId."}, status=status.HTTP_400_BAD_REQUEST)

        if cid is not None:
            from classes.models import Classroom

            classroom = Classroom.objects.filter(pk=cid).first()
            if not classroom:
                return Response({"detail": "Classroom not found."}, status=status.HTTP_404_NOT_FOUND)
            cdom = (
                C.DOMAIN_MATH
                if classroom.subject == Classroom.SUBJECT_MATH
                else C.DOMAIN_ENGLISH
            )
            if cdom != subject:
                return Response(
                    {"detail": "Subject does not match the classroom's subject."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if actor_role != C.ROLE_SUPER_ADMIN and not has_access_for_classroom(
                request.user, subject, cid
            ):
                return Response(
                    {"detail": "You do not have access to grant membership for this classroom."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if cid is None and actor_role != C.ROLE_SUPER_ADMIN:
            if not has_global_subject_access(request.user, subject):
                return Response(
                    {
                        "detail": "Global access grants require a global subject grant on your account.",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            target = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            grant, was_created = UserAccess.objects.get_or_create(
                user=target,
                subject=subject,
                classroom_id=cid,
                defaults={"granted_by": request.user},
            )
            if not was_created:
                UserAccess.objects.filter(pk=grant.pk).update(granted_by=request.user)

        logger.info(
            "access_grant actor_id=%s actor_role=%s actor_is_superuser=%s target_id=%s subject=%s classroom_id=%s created=%s",
            request.user.pk,
            actor_role,
            getattr(request.user, "is_superuser", False),
            target.pk,
            subject,
            cid,
            was_created,
        )
        return Response(
            {
                "id": grant.pk,
                "user_id": target.pk,
                "subject": subject,
                "classroom_id": grant.classroom_id,
                "created": was_created,
            },
            status=status.HTTP_201_CREATED if was_created else status.HTTP_200_OK,
        )
