"""Read-only Question Bank admin API (Phase A).

Exposure over the existing ``questionbank`` models for the admin browsing UI.
No writes here — triage/import mutations live in their own milestone. Auth gate is
global-staff-only (``CanManageQuestions``); ``IsAuthenticatedAndNotFrozen`` is the
project default but is listed explicitly for clarity.
"""
from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.pagination import LimitOffsetPagination

from access.permissions import CanManageQuestions
from users.permissions import IsAuthenticatedAndNotFrozen

from . import serializers as qb
from .models import (
    BankDomain,
    BankPassage,
    BankQuestion,
    BankQuestionVersion,
    BankSkill,
)

QB_PERMISSIONS = [IsAuthenticatedAndNotFrozen, CanManageQuestions]

_TRUTHY = {"1", "true", "yes", "on"}


def _truthy(raw) -> bool:
    return str(raw or "").strip().lower() in _TRUTHY


def _int_or_none(raw):
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class QbPagination(LimitOffsetPagination):
    """Project has no global PAGE_SIZE, so plain LimitOffset would return an
    unwrapped list; this gives a paginated envelope with sane bounds."""

    default_limit = 50
    max_limit = 200


@extend_schema(tags=["questionbank"])
class BankQuestionListView(generics.ListAPIView):
    """GET /api/questionbank/questions/ — filter/search the bank."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankQuestionListSerializer
    pagination_class = QbPagination

    def get_queryset(self):
        qs = BankQuestion.objects.select_related(
            "domain", "skill", "passage", "import_batch",
            "suggested_domain", "suggested_skill",
        )
        p = self.request.query_params
        if p.get("subject"):
            qs = qs.filter(subject=p["subject"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("difficulty"):
            qs = qs.filter(difficulty=p["difficulty"])
        source = p.get("source") or p.get("source_type")
        if source:
            qs = qs.filter(source_type=source)
        if (domain_id := _int_or_none(p.get("domain"))) is not None:
            qs = qs.filter(domain_id=domain_id)
        if (skill_id := _int_or_none(p.get("skill"))) is not None:
            qs = qs.filter(skill_id=skill_id)
        if (batch_id := _int_or_none(p.get("import_batch"))) is not None:
            qs = qs.filter(import_batch_id=batch_id)
        term = (p.get("search") or p.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(qb_id__icontains=term) | Q(question_text__icontains=term))
        return qs.order_by("-created_at", "-id")


@extend_schema(tags=["questionbank"])
class BankQuestionDetailView(generics.RetrieveAPIView):
    """GET /api/questionbank/questions/<id>/."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankQuestionDetailSerializer
    queryset = BankQuestion.objects.select_related(
        "domain", "skill", "passage", "import_batch",
        "suggested_domain", "suggested_skill", "current_version",
    )


@extend_schema(tags=["questionbank"])
class BankPassageListView(generics.ListAPIView):
    """GET /api/questionbank/passages/."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankPassageSerializer
    pagination_class = QbPagination

    def get_queryset(self):
        qs = BankPassage.objects.all()
        p = self.request.query_params
        if p.get("subject"):
            qs = qs.filter(subject=p["subject"])
        if (batch_id := _int_or_none(p.get("import_batch"))) is not None:
            qs = qs.filter(import_batch_id=batch_id)
        term = (p.get("search") or p.get("q") or "").strip()
        if term:
            qs = qs.filter(passage_text__icontains=term)
        return qs.order_by("-created_at", "-id")


@extend_schema(tags=["questionbank"])
class BankPassageDetailView(generics.RetrieveAPIView):
    """GET /api/questionbank/passages/<id>/."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankPassageSerializer
    queryset = BankPassage.objects.all()


@extend_schema(
    tags=["questionbank"],
    parameters=[
        OpenApiParameter("bank_question", int, description="Filter to one question's lineage."),
        OpenApiParameter("include_snapshot", bool, description="Include immutable snapshot_json."),
    ],
)
class BankQuestionVersionListView(generics.ListAPIView):
    """GET /api/questionbank/versions/ — append-only version lineage."""

    permission_classes = QB_PERMISSIONS
    pagination_class = QbPagination

    def get_serializer_class(self):
        if _truthy(self.request.query_params.get("include_snapshot")):
            return qb.BankQuestionVersionDetailSerializer
        return qb.BankQuestionVersionSerializer

    def get_queryset(self):
        qs = BankQuestionVersion.objects.all()
        if (bq_id := _int_or_none(self.request.query_params.get("bank_question"))) is not None:
            qs = qs.filter(bank_question_id=bq_id)
        return qs.order_by("bank_question_id", "-version_number")


@extend_schema(tags=["questionbank"], parameters=[OpenApiParameter("subject", str)])
class BankDomainListView(generics.ListAPIView):
    """GET /api/questionbank/domains/ — unpaginated taxonomy for filter dropdowns."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankDomainSerializer
    pagination_class = None

    def get_queryset(self):
        qs = BankDomain.objects.all()
        if self.request.query_params.get("subject"):
            qs = qs.filter(subject=self.request.query_params["subject"])
        return qs.order_by("subject", "display_order", "name")


@extend_schema(
    tags=["questionbank"],
    parameters=[OpenApiParameter("domain", int), OpenApiParameter("subject", str)],
)
class BankSkillListView(generics.ListAPIView):
    """GET /api/questionbank/skills/ — unpaginated; filter by domain or subject."""

    permission_classes = QB_PERMISSIONS
    serializer_class = qb.BankSkillSerializer
    pagination_class = None

    def get_queryset(self):
        qs = BankSkill.objects.select_related("domain")
        p = self.request.query_params
        if (domain_id := _int_or_none(p.get("domain"))) is not None:
            qs = qs.filter(domain_id=domain_id)
        if p.get("subject"):
            qs = qs.filter(domain__subject=p["subject"])
        return qs.order_by("domain__display_order", "display_order", "name")
