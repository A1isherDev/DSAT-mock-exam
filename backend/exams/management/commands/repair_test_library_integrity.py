from __future__ import annotations

import json
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from exams.models import PastpaperPack, PracticeTest


class Command(BaseCommand):
    help = "Repair pastpaper pack/section library integrity issues (safe, idempotent, minimal)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only print what would be changed.")
        parser.add_argument("--limit", type=int, default=2000, help="Max packs to touch.")
        parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON summary.")

    def handle(self, *args, **options):
        dry = bool(options["dry_run"])
        limit = int(options["limit"] or 2000)
        as_json = bool(options["json"])

        summary = defaultdict(lambda: {"count": 0, "ids": []})

        def _bump(kind: str, obj_id: int | None = None):
            summary[kind]["count"] += 1
            if obj_id is not None and len(summary[kind]["ids"]) < 50:
                summary[kind]["ids"].append(int(obj_id))

        touched = 0
        for pack in PastpaperPack.objects.order_by("id").iterator(chunk_size=200):
            if touched >= limit:
                break

            qs = PracticeTest.objects.filter(pastpaper_pack=pack, mock_exam__isnull=True)
            bad = qs.exclude(
                practice_date=pack.practice_date,
                form_type=pack.form_type,
                label=pack.label,
            )
            if not bad.exists():
                continue

            _bump("pack.section_signature_normalized", pack.pk)
            touched += 1
            if dry:
                continue

            with transaction.atomic():
                qs.update(
                    practice_date=pack.practice_date,
                    form_type=pack.form_type,
                    label=pack.label,
                )

        out = dict(summary)
        if as_json:
            self.stdout.write(json.dumps(out, indent=2, sort_keys=True))
            return

        self.stdout.write("TEST LIBRARY INTEGRITY REPAIR")
        self.stdout.write(json.dumps(out, indent=2, sort_keys=True))
        if dry:
            self.stdout.write("dry_run=True (no changes applied)")

