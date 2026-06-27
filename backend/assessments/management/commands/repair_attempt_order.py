from __future__ import annotations

import json
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from assessments.models import AssessmentAttempt, AssessmentQuestion


class Command(BaseCommand):
    """
    Re-sort each in-progress attempt's ``question_order`` into the canonical
    builder order ``(order, id)``.

    Historical context: attempts used to be created with a per-attempt random
    shuffle, so different students saw the same assignment's questions in
    different positions. The shuffle has been removed (new attempts are already
    canonical); this command realigns attempts that were started *before* the
    fix so every student converges on one identical order.

    SAFETY:
      - Only ``status=in_progress`` attempts are touched. Submitted/graded/
        abandoned attempts are permanent academic records and are never altered.
      - The id *set* is preserved exactly (focus-mode subsets stay a subset);
        only the ordering changes. Idempotent — a second run is a no-op.
    """

    help = "Re-sort in-progress attempts' question_order to canonical (order, id). Safe & idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only print what would change.")
        parser.add_argument("--limit", type=int, default=5000, help="Max attempts to scan.")
        parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON summary.")

    def _canonical_rank(self, attempt: AssessmentAttempt, ids: list[int]) -> dict[int, tuple[int, int]]:
        """Map each question id → its canonical (order, id) sort key."""
        # Prefer the pinned snapshot so the frozen content drives ordering;
        # fall back to live question rows for pre-snapshot attempts.
        order_by_id: dict[int, int] = {}
        if attempt.set_version_id and attempt.set_version is not None:
            from assessments.domain.snapshot_builder import questions_from_snapshot

            for q in questions_from_snapshot(attempt.set_version.snapshot_json):
                try:
                    order_by_id[int(q["id"])] = int(q.get("order", 0))
                except (KeyError, TypeError, ValueError):
                    continue
        # Supplement (or wholly populate) from live rows for any missing ids.
        missing = [qid for qid in ids if qid not in order_by_id]
        if missing:
            for qid, order in AssessmentQuestion.objects.filter(id__in=missing).values_list("id", "order"):
                order_by_id[int(qid)] = int(order)
        return {qid: (order_by_id.get(qid, 0), qid) for qid in ids}

    def handle(self, *args, **options):
        dry = bool(options["dry_run"])
        limit = int(options["limit"] or 5000)
        as_json = bool(options["json"])

        summary = defaultdict(lambda: {"count": 0, "ids": []})

        def _bump(kind: str, obj_id: int | None = None):
            summary[kind]["count"] += 1
            if obj_id is not None and len(summary[kind]["ids"]) < 50:
                summary[kind]["ids"].append(int(obj_id))

        scanned = 0
        qs = (
            AssessmentAttempt.objects.filter(status=AssessmentAttempt.STATUS_IN_PROGRESS)
            .select_related("set_version")
            .order_by("id")
        )
        for att in qs.iterator(chunk_size=200):
            if scanned >= limit:
                break
            scanned += 1

            raw = att.question_order or []
            ids = [int(x) for x in raw if isinstance(x, (int, str)) and str(x).isdigit()]
            if len(ids) < 2:
                continue

            rank = self._canonical_rank(att, ids)
            canonical = sorted(ids, key=lambda qid: rank[qid])
            if canonical == ids:
                continue  # already canonical — idempotent no-op

            _bump("attempt.reordered", att.pk)
            if dry:
                continue

            with transaction.atomic():
                locked = AssessmentAttempt.objects.select_for_update().get(pk=att.pk)
                # Re-check under lock: only rewrite if still in progress and unchanged set.
                if locked.status != AssessmentAttempt.STATUS_IN_PROGRESS:
                    continue
                locked.question_order = canonical
                locked.save(update_fields=["question_order"])

        out = dict(summary)
        if as_json:
            self.stdout.write(json.dumps(out, indent=2, sort_keys=True))
            return

        self.stdout.write("ATTEMPT ORDER REPAIR")
        self.stdout.write(json.dumps(out, indent=2, sort_keys=True))
        self.stdout.write(f"scanned={scanned}")
        if dry:
            self.stdout.write("dry_run=True (no changes applied)")
