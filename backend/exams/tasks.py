from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction

from .models import TestAttempt
from .metrics import incr as metric_incr

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5})
def score_attempt_async(self, attempt_id: int) -> dict:
    """
    Idempotent scoring task.
    Preconditions:
      - attempt.current_state == SCORING
    Postconditions:
      - attempt transitions to COMPLETED and score is persisted
    """
    with transaction.atomic():
        attempt = TestAttempt.objects.select_for_update().select_related("practice_test").get(pk=attempt_id)
        if attempt.current_state == TestAttempt.STATE_COMPLETED and attempt.is_completed:
            return {"status": "noop", "reason": "already_completed", "attempt_id": attempt_id}
        if attempt.current_state != TestAttempt.STATE_SCORING:
            return {
                "status": "noop",
                "reason": f"state_is_{attempt.current_state}",
                "attempt_id": attempt_id,
            }

        # Compute score and finalize
        attempt.complete_test()

    metric_incr("scoring_completed")
    logger.info("attempt_scored attempt_id=%s score=%s", attempt_id, attempt.score)
    return {"status": "ok", "attempt_id": attempt_id, "score": attempt.score}

