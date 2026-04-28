from __future__ import annotations

import json
import re

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from exams.models import PastpaperPack, PracticeTest


_SUBJECT_TAIL_RE = re.compile(
    r"(?:\s*[—–-]\s*(Reading\s*&\s*Writing|R\s*&\s*W|English|Math|Mathematics)\s*)+$",
    re.IGNORECASE,
)


def _suspicious_title_reasons(title: str) -> list[str]:
    t = (title or "").strip()
    if not t:
        return []
    out: list[str] = []
    if "//" in t or "\\\\" in t:
        out.append("contains_double_slash")
    if "  " in t:
        out.append("contains_double_space")
    # subject tail repeated (e.g. "X — Math — Math")
    if _SUBJECT_TAIL_RE.search(t):
        base = _SUBJECT_TAIL_RE.sub("", t).strip()
        if base and _SUBJECT_TAIL_RE.search(base):
            out.append("repeated_subject_tail")
    # overly long titles tend to be concatenation bugs
    if len(t) > 180:
        out.append("very_long_title")
    return out


class Command(BaseCommand):
    help = "Read-only integrity audit for pastpaper packs + practice library structure (prints counts + sample IDs)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50, help="Max IDs to print per category.")
        parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON only.")

    def handle(self, *args, **options):
        limit = int(options["limit"] or 50)
        as_json = bool(options["json"])

        report: dict[str, dict] = {}

        # ── Pastpaper packs ────────────────────────────────────────────────
        empty_packs = list(
            PastpaperPack.objects.annotate(section_count=Count("sections"))
            .filter(section_count=0)
            .values_list("id", flat=True)[:limit]
        )

        single_section_packs = list(
            PastpaperPack.objects.annotate(section_count=Count("sections"))
            .filter(section_count=1)
            .values_list("id", flat=True)[:limit]
        )

        # Packs whose sections disagree with the pack signature (should generally be normalized).
        mismatch_rows = []
        for pack in PastpaperPack.objects.all().order_by("id").iterator(chunk_size=200):
            bad = (
                PracticeTest.objects.filter(pastpaper_pack=pack)
                .filter(
                    Q(practice_date__isnull=False) & ~Q(practice_date=pack.practice_date)
                    | Q(form_type__isnull=False) & ~Q(form_type=pack.form_type)
                    | Q(label__isnull=False) & ~Q(label=pack.label)
                )
                .values_list("id", flat=True)[: min(limit, 25)]
            )
            bad_ids = list(bad)
            if bad_ids:
                mismatch_rows.append(
                    {
                        "pack_id": pack.pk,
                        "pack_signature": {
                            "practice_date": str(pack.practice_date) if pack.practice_date else None,
                            "form_type": pack.form_type,
                            "label": pack.label,
                        },
                        "sample_section_ids": bad_ids,
                    }
                )
                if len(mismatch_rows) >= limit:
                    break

        report["packs"] = {
            "packs_with_zero_sections": {"count": PastpaperPack.objects.annotate(section_count=Count("sections")).filter(section_count=0).count(), "ids": empty_packs},
            "packs_with_one_section": {"count": PastpaperPack.objects.annotate(section_count=Count("sections")).filter(section_count=1).count(), "ids": single_section_packs},
            "packs_with_section_signature_mismatch": {"count": len(mismatch_rows), "rows": mismatch_rows},
        }

        # ── Sections (PracticeTest) ─────────────────────────────────────────
        # A section should not be both mock_exam and pastpaper_pack.
        mixed_link_ids = list(
            PracticeTest.objects.filter(mock_exam__isnull=False, pastpaper_pack__isnull=False)
            .values_list("id", flat=True)[:limit]
        )

        # Standalone practice sections not in packs (potentially orphaned from pack grouping).
        orphan_standalone_ids = list(
            PracticeTest.objects.filter(mock_exam__isnull=True, pastpaper_pack__isnull=True)
            .values_list("id", flat=True)[:limit]
        )

        # Suspicious titles (likely concatenation/corruption artifacts).
        suspicious_title_rows = []
        for pt in PracticeTest.objects.only("id", "title").order_by("id").iterator(chunk_size=500):
            reasons = _suspicious_title_reasons(pt.title or "")
            if not reasons:
                continue
            suspicious_title_rows.append({"practice_test_id": pt.pk, "reasons": reasons, "title": (pt.title or "")[:220]})
            if len(suspicious_title_rows) >= limit:
                break

        report["sections"] = {
            "sections_with_both_mock_exam_and_pack_set": {
                "count": PracticeTest.objects.filter(mock_exam__isnull=False, pastpaper_pack__isnull=False).count(),
                "ids": mixed_link_ids,
            },
            "standalone_sections_without_pack": {
                "count": PracticeTest.objects.filter(mock_exam__isnull=True, pastpaper_pack__isnull=True).count(),
                "ids": orphan_standalone_ids,
            },
            "sections_with_suspicious_titles": {
                "count": len(suspicious_title_rows),
                "rows": suspicious_title_rows,
            },
        }

        if as_json:
            self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
            return

        self.stdout.write("TEST LIBRARY INTEGRITY AUDIT")
        self.stdout.write(json.dumps(report, indent=2, sort_keys=True))

