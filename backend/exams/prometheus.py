"""Prometheus text exposition for exam-engine counters (no extra dependencies)."""

from __future__ import annotations

from django.utils import timezone

from .metrics import get_counter


def render_exams_prometheus_text() -> str:
    lines: list[str] = [
        "# HELP exams_attempt_submit_module_total Module submits accepted.",
        "# TYPE exams_attempt_submit_module_total counter",
        f"exams_attempt_submit_module_total {get_counter('submit_module')}",
        "# HELP exams_attempt_idempotency_replay_total Idempotency key replays.",
        "# TYPE exams_attempt_idempotency_replay_total counter",
        f"exams_attempt_idempotency_replay_total {get_counter('idempotency_replay')}",
        "# HELP exams_attempt_submit_duplicate_prevented_total Duplicate submits prevented by locking/idempotency.",
        "# TYPE exams_attempt_submit_duplicate_prevented_total counter",
        f"exams_attempt_submit_duplicate_prevented_total {get_counter('submit_duplicate_prevented')}",
        "# HELP exams_attempt_version_conflict_total Optimistic concurrency conflicts.",
        "# TYPE exams_attempt_version_conflict_total counter",
        f"exams_attempt_version_conflict_total {get_counter('version_conflict')}",
        "# HELP exams_attempt_scoring_enqueued_total Attempts transitioned to SCORING.",
        "# TYPE exams_attempt_scoring_enqueued_total counter",
        f"exams_attempt_scoring_enqueued_total {get_counter('scoring_enqueued')}",
        "# HELP exams_attempt_scoring_completed_total Attempts completed from scoring.",
        "# TYPE exams_attempt_scoring_completed_total counter",
        f"exams_attempt_scoring_completed_total {get_counter('scoring_completed')}",
        "# HELP exams_metrics_generated_at Unix timestamp when metrics rendered.",
        "# TYPE exams_metrics_generated_at gauge",
        f"exams_metrics_generated_at {int(timezone.now().timestamp())}",
    ]
    return "\n".join(lines) + "\n"

