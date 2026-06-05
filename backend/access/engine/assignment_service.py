"""
AssignmentService — admin-facing grant creation (individual + bulk).

Thin orchestration over :class:`AccessService` for single grants; a set-based
``bulk_*`` path that creates many grants in a constant number of queries
(``bulk_create``) — fixing the per-student query loop in the legacy bulk-assign.
"""

from __future__ import annotations

from typing import Iterable, Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from access import constants, resources
from access.models import AccessGrantEvent, ResourceAccessGrant

from .access_service import AccessService, _snapshot


class AssignmentService:
    # -- validation ------------------------------------------------------

    @staticmethod
    def _validate_subject(subject: str) -> str:
        s = (subject or "").strip().lower()
        if s not in constants.ALL_DOMAIN_SUBJECTS:
            raise ValidationError(f"Invalid subject {subject!r}; expected math/english.")
        return s

    @staticmethod
    def _validate_resource(resource_type: str, resource_id: int, *, require_exists: bool = True):
        rt = resources.get(resource_type)
        if rt is None:
            raise ValidationError(f"Unknown resource_type {resource_type!r}.")
        if require_exists and rt.get_instance(resource_id) is None:
            raise ValidationError(f"{resource_type}#{resource_id} does not exist.")
        return rt

    # -- individual ------------------------------------------------------

    @classmethod
    def assign_subject(
        cls, user, subject, *, actor=None, source=ResourceAccessGrant.SOURCE_MANUAL,
        classroom=None, expires_at=None, note="",
    ) -> ResourceAccessGrant:
        subject = cls._validate_subject(subject)
        return AccessService.grant_subject(
            user, subject, source=source, granted_by=actor,
            classroom=classroom, expires_at=expires_at, note=note,
        )

    @classmethod
    def assign_resource(
        cls, user, resource_type, resource_id, *, actor=None,
        source=ResourceAccessGrant.SOURCE_MANUAL, classroom=None, expires_at=None,
        note="", require_exists=True,
    ) -> ResourceAccessGrant:
        cls._validate_resource(resource_type, resource_id, require_exists=require_exists)
        return AccessService.grant_resource(
            user, resource_type, resource_id, source=source, granted_by=actor,
            classroom=classroom, expires_at=expires_at, note=note,
        )

    # -- bulk (set-based, constant query count) --------------------------

    @classmethod
    @transaction.atomic
    def bulk_assign_resource(
        cls, users: Iterable, resource_type, resource_id, *, actor=None,
        source=ResourceAccessGrant.SOURCE_BULK, classroom=None, expires_at=None,
        note="", require_exists=True,
    ) -> dict:
        """
        Grant one resource to many users in O(1) queries. Idempotent: users who
        already hold an ACTIVE grant are skipped. Returns a summary dict.
        """
        cls._validate_resource(resource_type, resource_id, require_exists=require_exists)
        users = list(users)
        if not users:
            return {"requested": 0, "created": 0, "skipped": 0, "grant_ids": []}

        user_ids = [u.pk for u in users]
        classroom_id = getattr(classroom, "pk", classroom)

        existing_user_ids = set(
            ResourceAccessGrant.objects.filter(
                user_id__in=user_ids,
                scope=ResourceAccessGrant.SCOPE_RESOURCE,
                resource_type=resource_type,
                resource_id=resource_id,
                status=ResourceAccessGrant.STATUS_ACTIVE,
                classroom_id=classroom_id,
            ).values_list("user_id", flat=True)
        )
        to_create = [
            ResourceAccessGrant(
                user_id=uid,
                scope=ResourceAccessGrant.SCOPE_RESOURCE,
                resource_type=resource_type,
                resource_id=resource_id,
                classroom_id=classroom_id,
                source=source,
                status=ResourceAccessGrant.STATUS_ACTIVE,
                granted_by=actor,
                expires_at=expires_at,
            )
            for uid in user_ids
            if uid not in existing_user_ids
        ]
        created = ResourceAccessGrant.objects.bulk_create(to_create, ignore_conflicts=True)
        # Re-fetch to obtain ids reliably across backends, then audit in one insert.
        fresh = list(
            ResourceAccessGrant.objects.filter(
                user_id__in=[g.user_id for g in to_create],
                scope=ResourceAccessGrant.SCOPE_RESOURCE,
                resource_type=resource_type,
                resource_id=resource_id,
                classroom_id=classroom_id,
                status=ResourceAccessGrant.STATUS_ACTIVE,
            )
        )
        AccessGrantEvent.objects.bulk_create(
            [
                AccessGrantEvent(
                    grant=g, action=AccessGrantEvent.ACTION_GRANTED,
                    actor=actor, note=note, snapshot=_snapshot(g),
                )
                for g in fresh
                if g.user_id not in existing_user_ids
            ]
        )
        return {
            "requested": len(users),
            "created": len(to_create),
            "skipped": len(existing_user_ids),
            "grant_ids": [g.pk for g in fresh],
        }

    @classmethod
    @transaction.atomic
    def bulk_assign_subject(
        cls, users: Iterable, subject, *, actor=None,
        source=ResourceAccessGrant.SOURCE_BULK, classroom=None, expires_at=None, note="",
    ) -> dict:
        subject = cls._validate_subject(subject)
        users = list(users)
        if not users:
            return {"requested": 0, "created": 0, "skipped": 0, "grant_ids": []}
        user_ids = [u.pk for u in users]
        classroom_id = getattr(classroom, "pk", classroom)
        existing_user_ids = set(
            ResourceAccessGrant.objects.filter(
                user_id__in=user_ids,
                scope=ResourceAccessGrant.SCOPE_SUBJECT,
                subject=subject,
                status=ResourceAccessGrant.STATUS_ACTIVE,
                classroom_id=classroom_id,
            ).values_list("user_id", flat=True)
        )
        to_create = [
            ResourceAccessGrant(
                user_id=uid,
                scope=ResourceAccessGrant.SCOPE_SUBJECT,
                subject=subject,
                classroom_id=classroom_id,
                source=source,
                status=ResourceAccessGrant.STATUS_ACTIVE,
                granted_by=actor,
                expires_at=expires_at,
            )
            for uid in user_ids
            if uid not in existing_user_ids
        ]
        ResourceAccessGrant.objects.bulk_create(to_create, ignore_conflicts=True)
        fresh = list(
            ResourceAccessGrant.objects.filter(
                user_id__in=[g.user_id for g in to_create],
                scope=ResourceAccessGrant.SCOPE_SUBJECT,
                subject=subject,
                classroom_id=classroom_id,
                status=ResourceAccessGrant.STATUS_ACTIVE,
            )
        )
        AccessGrantEvent.objects.bulk_create(
            [
                AccessGrantEvent(
                    grant=g, action=AccessGrantEvent.ACTION_GRANTED,
                    actor=actor, note=note, snapshot=_snapshot(g),
                )
                for g in fresh
                if g.user_id not in existing_user_ids
            ]
        )
        return {
            "requested": len(users),
            "created": len(to_create),
            "skipped": len(existing_user_ids),
            "grant_ids": [g.pk for g in fresh],
        }

    # -- revocation convenience -----------------------------------------

    @classmethod
    def revoke_resource(cls, user, resource_type, resource_id, *, actor=None, note="") -> int:
        grants = ResourceAccessGrant.objects.filter(
            user=user, scope=ResourceAccessGrant.SCOPE_RESOURCE,
            resource_type=resource_type, resource_id=resource_id,
            status=ResourceAccessGrant.STATUS_ACTIVE,
        )
        n = 0
        for g in grants:
            AccessService.revoke(g, actor=actor, note=note)
            n += 1
        return n

    @classmethod
    def revoke_subject(cls, user, subject, *, actor=None, classroom=None, note="") -> int:
        subject = cls._validate_subject(subject)
        classroom_id = getattr(classroom, "pk", classroom)
        grants = ResourceAccessGrant.objects.filter(
            user=user, scope=ResourceAccessGrant.SCOPE_SUBJECT, subject=subject,
            classroom_id=classroom_id, status=ResourceAccessGrant.STATUS_ACTIVE,
        )
        n = 0
        for g in grants:
            AccessService.revoke(g, actor=actor, note=note)
            n += 1
        return n
