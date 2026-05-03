"""
Question ``order`` — sparse monotonic allocation via ``Module.question_order_high_water``,
compaction scheduled off the request path (Celery / post-commit thread fallback), jittered
optional blocking backoff on UNIQUE conflicts.

Contention: one row lock per ``Module`` keeps high-water consistent; heavy dense reindex runs
async. For further scale, shard counters per module would require new schema (not implemented).

``QuerySet.update`` / raw SQL bypass hooks: run ``exam_question_orders`` or call
``dense_compact_module_orders`` / resync high_water after bulk maintenance.
"""

from __future__ import annotations

import logging
import random
import threading
import time

from django.apps import apps
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Count, Max

try:
    from exams.metrics import incr as exam_metric_incr
except ImportError:  # pragma: no cover
    def exam_metric_incr(key: str, delta: int = 1) -> int:
        return 0

logger = logging.getLogger(__name__)

_COMPACT_PENDING_KEY = "exam:qorder:compact:pending:{}"
_CONFLICT_WINDOW_KEY = "exam:qorder:conflict_rate:{}"


def sparse_step() -> int:
    return max(64, int(getattr(settings, "EXAM_QUESTION_ORDER_SPARSE_STEP", 1024)))


def sparse_order_retries() -> int:
    return max(3, min(32, int(getattr(settings, "EXAM_QUESTION_ORDER_MAX_RETRY", 8))))


def compaction_threshold() -> int:
    return int(getattr(settings, "EXAM_QUESTION_ORDER_COMPACTION_THRESHOLD", 50_000_000))


def compaction_ratio_threshold() -> float:
    return float(getattr(settings, "EXAM_QUESTION_ORDER_COMPACTION_RATIO_THRESHOLD", 5000.0))


def backoff_sleep_before_retry(attempt_number: int) -> None:
    """
    Optional exponential backoff + jitter after a failed attempt (attempt_number is 1-based retry index).

    When ``EXAM_QUESTION_RETRY_BLOCKING_SLEEP`` is False (recommended under load), skips ``sleep``;
    sparse step skew in ``allocate_order_with_high_water`` still spreads writers.
    """
    if attempt_number <= 1:
        return
    if not bool(getattr(settings, "EXAM_QUESTION_RETRY_BLOCKING_SLEEP", False)):
        exam_metric_incr("exam_question_order_retry_nonblocking_total")
        return
    base = max(1, int(getattr(settings, "EXAM_QUESTION_RETRY_BACKOFF_BASE_MS", 8)))
    cap = max(base, int(getattr(settings, "EXAM_QUESTION_RETRY_BACKOFF_CAP_MS", 750)))
    jitter = max(0, int(getattr(settings, "EXAM_QUESTION_RETRY_JITTER_MS", 48)))
    expo = min(cap, base * (2 ** (attempt_number - 2)))
    sleep_ms = expo + random.uniform(0, jitter)
    exam_metric_incr("exam_question_order_retry_backoff_total")
    time.sleep(sleep_ms / 1000.0)


def dense_compact_module_orders(module_id: int | None) -> int:
    """
    Collapse orders to contiguous ``0..n-1`` (stable by ``id``) and reset
    ``Module.question_order_high_water`` to ``max_order`` after compaction.
    """
    if module_id is None:
        return 0

    QuestionModel = apps.get_model("exams", "Question")
    ModuleModel = apps.get_model("exams", "Module")

    qs = list(
        QuestionModel.objects.filter(module_id=module_id).order_by("order", "id")
    )
    batch = []
    for idx, row in enumerate(qs):
        if row.order != idx:
            row.order = idx
            batch.append(row)
    if batch:
        QuestionModel.objects.bulk_update(batch, ["order"])

    n = len(qs)
    max_ord = max(0, n - 1) if n else 0
    ModuleModel.objects.filter(pk=module_id).update(question_order_high_water=max_ord)
    return len(batch)


def normalize_question_orders_for_module(module_id: int | None) -> int:
    return dense_compact_module_orders(module_id)


def _module_has_duplicate_orders(module_id: int) -> bool:
    QuestionModel = apps.get_model("exams", "Question")

    return (
        QuestionModel.objects.filter(module_id=module_id)
        .values("order")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
        .exists()
    )


def _repair_high_water_if_lagged(module_row, module_id: int) -> None:
    """
    If any question has order > stored high_water (e.g. bulk SQL), lift high_water before allocation.
    Cheap hot path: ``exists(order__gt=hw)``; Max only when drift is present.
    """
    QuestionModel = apps.get_model("exams", "Question")
    hw = int(module_row.question_order_high_water or 0)
    if not QuestionModel.objects.filter(module_id=module_id, order__gt=hw).exists():
        return
    mx_raw = QuestionModel.objects.filter(module_id=module_id).aggregate(m=Max("order"))["m"]
    mx = int(mx_raw or 0)
    new_hw = max(hw, mx)
    module_row.question_order_high_water = new_hw
    exam_metric_incr("exam_question_order_high_water_repaired_total")
    logger.warning(
        "question_order_high_water_repaired module_id=%s was=%s max_order=%s",
        module_id,
        hw,
        mx,
    )


def _maybe_auto_correct_duplicates(module_id: int, module_row=None) -> bool:
    max_pairs = int(getattr(settings, "EXAM_QUESTION_ORDER_AUTO_CORRECT_MAX_DUP_PAIRS", 0))
    if max_pairs <= 0:
        return False
    if not _module_has_duplicate_orders(module_id):
        return False

    QuestionModel = apps.get_model("exams", "Question")

    pair_count = (
        QuestionModel.objects.filter(module_id=module_id)
        .values("order")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
        .count()
    )
    if pair_count > max_pairs:
        return False
    logger.info(
        "question_order_auto_correct_compacting module_id=%s duplicate_order_keys=%s",
        module_id,
        pair_count,
    )
    exam_metric_incr("exam_question_order_auto_compact_total")
    dense_compact_module_orders(module_id)
    if module_row is not None:
        module_row.refresh_from_db(fields=["question_order_high_water"])
    return True


def _should_schedule_dense_compaction(module_row, module_id: int) -> bool:
    QuestionModel = apps.get_model("exams", "Question")
    hw = int(module_row.question_order_high_water or 0)
    if hw >= compaction_threshold():
        return True

    rt = compaction_ratio_threshold()
    min_n = int(
        getattr(settings, "EXAM_QUESTION_ORDER_COMPACTION_MIN_QUESTIONS_FOR_RATIO", 40)
    )
    # For n >= min_n, ratio >= rt implies hw >= rt * min_n. Below that the ratio arm cannot fire.
    if hw < rt * min_n:
        if hw > 0 and not QuestionModel.objects.filter(module_id=module_id).exists():
            return True
        return False

    n = (
        QuestionModel.objects.filter(module_id=module_id).aggregate(c=Count("id")).get("c")
        or 0
    )
    if n == 0:
        return hw > 0

    ratio = hw / float(n)
    return n >= min_n and ratio >= rt


def _dispatch_compaction_worker(module_id: int) -> None:
    broker = str(getattr(settings, "CELERY_BROKER_URL", "") or "").strip()
    eager = bool(getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False))
    if broker or eager:
        try:
            from .tasks import compact_module_question_orders

            compact_module_question_orders.delay(module_id)
        except Exception:
            logger.exception("compact_task_enqueue_failed module_id=%s", module_id)
            dense_compact_module_orders(module_id)
        return

    if bool(getattr(settings, "EXAM_QUESTION_ORDER_COMPACT_THREAD_FALLBACK", True)):
        threading.Thread(
            target=dense_compact_module_orders,
            args=(module_id,),
            daemon=True,
            name=f"qorder-compact-{module_id}",
        ).start()
        return

    dense_compact_module_orders(module_id)


def schedule_dense_compaction_after_commit(module_id: int) -> None:
    """
    Dedupe and enqueue dense compaction after successful commit (Celery or thread fallback).
    """
    if module_id is None:
        return

    def _on_commit() -> None:
        key = _COMPACT_PENDING_KEY.format(module_id)
        try:
            if not cache.add(key, 1, timeout=120):
                return
        except Exception:
            pass
        _dispatch_compaction_worker(module_id)

    transaction.on_commit(_on_commit)


def _record_unique_conflict_and_maybe_alert(module_id: int, attempt: int) -> None:
    exam_metric_incr("exam_question_order_unique_conflict_total")
    limit = int(getattr(settings, "EXAM_QUESTION_ORDER_CONFLICT_ALERT_PER_MINUTE", 200))
    if limit <= 0:
        return
    bucket = int(time.time()) // 60
    key = _CONFLICT_WINDOW_KEY.format(bucket)
    try:
        n = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=180)
        n = 1
    if n < limit:
        return
    alert_key = f"exam:qorder:conflict_alert:{bucket}"
    try:
        if not cache.add(alert_key, 1, timeout=300):
            return
    except Exception:
        pass
    logger.error(
        "ALERT question_order_high_unique_conflict_rate module_id=%s attempt=%s minute_bucket=%s "
        "conflicts_this_minute~=%s threshold=%s",
        module_id,
        attempt,
        bucket,
        n,
        limit,
    )
    exam_metric_incr("exam_question_order_conflict_alert_total")


def allocate_order_with_high_water(
    question,
    *,
    module_row,
    siblings_ex,
    attempt: int,
) -> None:
    """
    Assign ``question.order`` using ``Module.question_order_high_water`` (no Max-scan on hot path).
    """
    step = sparse_step()

    desired = int(getattr(question, "order", 0) or 0)
    hw = int(module_row.question_order_high_water or 0)

    if attempt == 1 and not siblings_ex.exists():
        question.order = desired if desired >= 0 else 0
        module_row.question_order_high_water = max(hw, int(question.order))
        return

    if attempt == 1 and not siblings_ex.filter(order=desired).exists():
        question.order = desired
        module_row.question_order_high_water = max(hw, desired)
        return

    skew = (attempt - 1) * step
    candidate = hw + step + skew
    question.order = candidate
    module_row.question_order_high_water = max(hw, candidate)


def save_question_with_order_retries(question, *args, **kwargs) -> None:
    QuestionModel = apps.get_model("exams", "Question")
    ModuleModel = apps.get_model("exams", "Module")

    kw_plain = dict(kwargs)
    kw_plain["_plain_db_save"] = True

    mid = getattr(question, "module_id", None)
    if mid is None:
        question.save(*args, **kw_plain)
        return

    retries = sparse_order_retries()
    last_err: IntegrityError | None = None

    for attempt in range(1, retries + 1):
        backoff_sleep_before_retry(attempt)

        try:
            with transaction.atomic():
                mod = ModuleModel.objects.select_for_update().get(pk=mid)

                _repair_high_water_if_lagged(mod, mid)
                _maybe_auto_correct_duplicates(mid, mod)

                if _should_schedule_dense_compaction(mod, mid):
                    logger.info(
                        "question_order_compact_scheduled module_id=%s high_water=%s",
                        mid,
                        mod.question_order_high_water,
                    )
                    exam_metric_incr("exam_question_order_compaction_scheduled_total")
                    schedule_dense_compaction_after_commit(mid)

                siblings_ex = QuestionModel.objects.filter(module_id=mid)
                if getattr(question, "pk", None):
                    siblings_ex = siblings_ex.exclude(pk=question.pk)

                allocate_order_with_high_water(
                    question,
                    module_row=mod,
                    siblings_ex=siblings_ex,
                    attempt=attempt,
                )
                mod.save(update_fields=["question_order_high_water"])

                question.save(*args, **kw_plain)

            return

        except IntegrityError as exc:
            last_err = exc
            err_s = str(exc).lower()
            if "unique" not in err_s and "uniq_" not in err_s and "constraint" not in err_s:
                raise
            logger.debug(
                "question_order_unique_retry attempt=%s question_id=%s module_id=%s order=%s",
                attempt,
                getattr(question, "pk", None),
                mid,
                getattr(question, "order", None),
            )
            _record_unique_conflict_and_maybe_alert(mid, attempt)
            if question.pk:
                try:
                    question.refresh_from_db(fields=["order"])
                except QuestionModel.DoesNotExist:
                    pass

    logger.warning(
        "question_order_unique_exhausted module_id=%s pk=%s last_order=%s",
        mid,
        getattr(question, "pk", None),
        getattr(question, "order", None),
    )
    if last_err:
        raise last_err
    raise IntegrityError("question UNIQUE(module_id, order) retries exhausted without prior error capture")


def prepare_sparse_order(question, *, module_id: int, attempt: int) -> None:
    """Backward-compatible name; allocation is handled inside ``save_question_with_order_retries``."""
    QuestionModel = apps.get_model("exams", "Question")
    ModuleModel = apps.get_model("exams", "Module")
    mod = ModuleModel.objects.filter(pk=module_id).first()
    if not mod:
        return

    siblings_ex = QuestionModel.objects.filter(module_id=module_id)
    if getattr(question, "pk", None):
        siblings_ex = siblings_ex.exclude(pk=question.pk)
    allocate_order_with_high_water(
        question,
        module_row=mod,
        siblings_ex=siblings_ex,
        attempt=attempt,
    )


__all__ = [
    "allocate_order_with_high_water",
    "backoff_sleep_before_retry",
    "compaction_ratio_threshold",
    "compaction_threshold",
    "dense_compact_module_orders",
    "normalize_question_orders_for_module",
    "prepare_sparse_order",
    "save_question_with_order_retries",
    "schedule_dense_compaction_after_commit",
    "sparse_order_retries",
    "sparse_step",
]
