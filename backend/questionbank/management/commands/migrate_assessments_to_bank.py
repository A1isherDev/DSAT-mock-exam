"""
Bulk-migrate assessment questions into the Question Bank as APPROVED, student-visible
bank questions (with best-guess taxonomy), reusing the shared
``assessments.domain.bank_sync.sync_assessment_question_to_bank`` service — the same
code path the live builder hooks use. Idempotent: already-linked questions are updated
in place; identical content is deduped.

Usage:
    python manage.py migrate_assessments_to_bank --dry-run
    python manage.py migrate_assessments_to_bank            # active questions
    python manage.py migrate_assessments_to_bank --all      # include inactive too
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Migrate AssessmentQuestion rows into the Question Bank (APPROVED, provisional taxonomy)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report candidates only.")
        parser.add_argument("--all", action="store_true", help="Include inactive questions.")
        parser.add_argument("--limit", type=int, default=0, help="Max questions (0 = all).")

    def handle(self, *args, **opts):
        from assessments.domain.bank_sync import sync_assessment_question_to_bank
        from assessments.models import AssessmentQuestion

        qs = AssessmentQuestion.objects.select_related("assessment_set").order_by("id")
        if not opts["all"]:
            qs = qs.filter(is_active=True)
        if opts["limit"]:
            qs = qs[: opts["limit"]]

        total = qs.count()
        self.stdout.write(f"Candidates: {total}")
        if opts["dry_run"]:
            self.stdout.write(self.style.WARNING("DRY-RUN — nothing written."))
            return

        done = errors = 0
        for aq in qs.iterator():
            try:
                with transaction.atomic():
                    sync_assessment_question_to_bank(aq)
                done += 1
            except Exception as exc:  # noqa: BLE001 — report & continue
                errors += 1
                self.stderr.write(self.style.ERROR(f"AQ {aq.id}: {exc}"))

        self.stdout.write(self.style.SUCCESS(f"DONE synced={done} errors={errors}"))
