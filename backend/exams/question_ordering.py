"""
ModuleQuestion ``order`` — **dense only** (0..n-1 per module), with ``Module`` row lock for writes.

All mutations that assign per-module ordering go through the same rules:
- ``select_for_update()`` on the parent ``Module`` for the duration of the reorder.
- Two-phase reassignment using a large temporary ``order`` band so ``UNIQUE(module, order)``
  is never violated while ``order`` is a ``PositiveIntegerField``.

``QuerySet.update`` / raw SQL can still bypass this module — run
``exam_question_orders --repair`` or call ``dense_compact_module_orders_locked``.
"""

from __future__ import annotations

import logging

from django.apps import apps
from django.db import transaction
# Must exceed any plausible in-service dense index; used only inside locked transactions.
ORDER_TEMP_BASE = 10_000_000

logger = logging.getLogger(__name__)


def dense_compact_module_orders(module_id: int | None) -> int:
    """
    Collapse orders to contiguous ``0..n-1`` (stable by ``id``) and set
    ``Module.question_order_high_water`` to ``n-1`` (or 0 if empty).

    Does **not** acquire a module lock — callers that need concurrency safety should use
    ``dense_compact_module_orders_locked`` or hold their own ``select_for_update`` on the module.
    """
    if module_id is None:
        return 0

    ModuleModel = apps.get_model("exams", "Module")
    ModuleQuestionModel = apps.get_model("exams", "ModuleQuestion")

    links = list(
        ModuleQuestionModel.objects.filter(module_id=module_id)
        .select_related("question")
        .order_by("order", "id")
    )
    batch_links = []
    for idx, link in enumerate(links):
        if link.order != idx:
            link.order = idx
            batch_links.append(link)
    if batch_links:
        ModuleQuestionModel.objects.bulk_update(batch_links, ["order"])

    n = len(links)
    max_ord = max(0, n - 1) if n else 0
    ModuleModel.objects.filter(pk=module_id).update(question_order_high_water=max_ord)
    return len(batch_links)


def dense_compact_module_orders_locked(module_id: int | None) -> int:
    """Same as ``dense_compact_module_orders`` but under ``select_for_update(Module)``."""
    if module_id is None:
        return 0
    ModuleModel = apps.get_model("exams", "Module")
    with transaction.atomic():
        ModuleModel.objects.select_for_update().get(pk=module_id)
        return dense_compact_module_orders(module_id)


def normalize_question_orders_for_module(module_id: int | None) -> int:
    return dense_compact_module_orders(module_id)


def reindex_module_questions_dense_locked(module_id: int, ordered: list) -> None:
    """
    Persist ``ordered`` sequence as ``order`` = 0..len-1.

    Caller must hold ``Module`` row lock and run inside ``transaction.atomic``.
    """
    ModuleModel = apps.get_model("exams", "Module")
    ModuleQuestionModel = apps.get_model("exams", "ModuleQuestion")

    n = len(ordered)
    if n == 0:
        ModuleModel.objects.filter(pk=module_id).update(question_order_high_water=0)
        return

    # Phase 1: unique temp band (PositiveIntegerField-safe).
    for i, link in enumerate(ordered):
        link.order = ORDER_TEMP_BASE + i
    with_pk = [l for l in ordered if l.pk]
    if with_pk:
        ModuleQuestionModel.objects.bulk_update(with_pk, ["order"])

    # INSERT links that did not exist yet.
    for link in ordered:
        if not link.pk:
            link.save()

    # Phase 2: dense indices.
    for i, link in enumerate(ordered):
        link.order = i
    ModuleQuestionModel.objects.bulk_update(ordered, ["order"])

    ModuleModel.objects.filter(pk=module_id).update(question_order_high_water=max(0, n - 1))


def save_question_dense_locked(question, *args, **kwargs) -> None:
    """
    Back-compat shim: questions are now assigned via ModuleQuestion.

    Prefer calling ``assign_question_to_module_dense_locked(module_id, question, insert_at=...)``.
    """
    QuestionModel = apps.get_model("exams", "Question")
    ModuleModel = apps.get_model("exams", "Module")
    ModuleQuestionModel = apps.get_model("exams", "ModuleQuestion")

    mid = getattr(question, "module_id", None)
    if mid is None:
        kw = dict(kwargs)
        kw["_plain_db_save"] = True
        question.save(*args, **kw)
        return

    had_pk = bool(question.pk)
    kw_plain = dict(kwargs)
    kw_plain["_plain_db_save"] = True

    with transaction.atomic():
        ModuleModel.objects.select_for_update().get(pk=mid)
        # Ensure question row exists (so ModuleQuestion FK is valid).
        if not had_pk:
            question.save(*args, **kw_plain)
            had_pk = True

        siblings = list(
            ModuleQuestionModel.objects.filter(module_id=mid)
            .exclude(question_id=question.pk)
            .select_related("question")
            .order_by("order", "id")
        )
        insert_at = int(getattr(question, "order", 0) or 0)
        insert_at = max(0, min(insert_at, len(siblings)))
        link = ModuleQuestionModel(module_id=mid, question_id=question.pk, order=insert_at)
        link.question = question
        ordered = siblings[:insert_at] + [link] + siblings[insert_at:]

        reindex_module_questions_dense_locked(mid, ordered)

    question.save(*args, **kw_plain)


def assign_question_to_module_dense_locked(*, module_id: int, question, insert_at: int | None = None) -> None:
    """
    Create/update the ModuleQuestion link for (module_id, question) with dense ordering.

    Caller may pass ``insert_at`` as a 0-based index; omitted => append.
    """
    ModuleModel = apps.get_model("exams", "Module")
    ModuleQuestionModel = apps.get_model("exams", "ModuleQuestion")

    if not getattr(question, "pk", None):
        question.save()

    with transaction.atomic():
        ModuleModel.objects.select_for_update().get(pk=module_id)
        siblings = list(
            ModuleQuestionModel.objects.filter(module_id=module_id)
            .exclude(question_id=question.pk)
            .select_related("question")
            .order_by("order", "id")
        )
        if insert_at is None:
            insert_at = len(siblings)
        insert_at = int(insert_at or 0)
        insert_at = max(0, min(insert_at, len(siblings)))

        link = ModuleQuestionModel(module_id=module_id, question_id=question.pk, order=insert_at)
        link.question = question
        ordered = siblings[:insert_at] + [link] + siblings[insert_at:]
        reindex_module_questions_dense_locked(int(module_id), ordered)


def assert_module_question_dense_integrity(
    *, module_id: int, raise_on_error: bool = False, context: str = ""
) -> bool:
    """
    Check invariant: ModuleQuestion.order is exactly dense 0..n-1 for the module.
    Returns True when healthy; otherwise logs and optionally raises RuntimeError.
    """
    ModuleQuestionModel = apps.get_model("exams", "ModuleQuestion")
    from django.db.models import Count, Max, Min, Sum

    agg = ModuleQuestionModel.objects.filter(module_id=module_id).aggregate(
        c=Count("id"),
        distinct_orders=Count("order", distinct=True),
        min_o=Min("order"),
        max_o=Max("order"),
        sum_o=Sum("order"),
    )
    n = int(agg["c"] or 0)
    if n == 0:
        return True
    distinct_orders = int(agg["distinct_orders"] or 0)
    min_o = int(agg["min_o"] or 0)
    max_o = int(agg["max_o"] or 0)
    sum_o = int(agg["sum_o"] or 0)

    expected_sum = (n * (n - 1)) // 2
    ok = (
        distinct_orders == n
        and min_o == 0
        and max_o == n - 1
        and sum_o == expected_sum
    )
    if ok:
        return True

    msg = (
        "module_question_order_integrity_failed module_id=%s n=%s distinct=%s min=%s max=%s sum=%s expected_sum=%s ctx=%s"
        % (module_id, n, distinct_orders, min_o, max_o, sum_o, expected_sum, (context or ""))
    )
    logger.error(msg)
    if raise_on_error:
        raise RuntimeError(msg)
    return False


__all__ = [
    "ORDER_TEMP_BASE",
    "dense_compact_module_orders",
    "dense_compact_module_orders_locked",
    "normalize_question_orders_for_module",
    "reindex_module_questions_dense_locked",
    "save_question_dense_locked",
    "assign_question_to_module_dense_locked",
    "assert_module_question_dense_integrity",
]
