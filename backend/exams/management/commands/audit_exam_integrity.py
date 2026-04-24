from __future__ import annotations

import json
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from exams.engine_integrity import audit_attempt_invariants, required_module_orders_for_test
from exams.models import MockExam, Module, PracticeTest, Question, TestAttempt


class Command(BaseCommand):
    help = "Read-only SAT testing engine integrity audit (prints counts + sample IDs)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50, help="Max IDs to print per category.")
        parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON only.")

    def handle(self, *args, **options):
        limit = int(options["limit"] or 50)
        as_json = bool(options["json"])

        report: dict[str, dict] = {}

        # ── PracticeTest / Module integrity ─────────────────────────────────
        missing_m1 = []
        missing_m2 = []
        dup_orders = []
        invalid_order = list(
            Module.objects.exclude(module_order__in=[1, 2]).values_list("id", flat=True)[:limit]
        )
        non_positive_timer = list(
            Module.objects.filter(time_limit_minutes__lte=0).values_list("id", flat=True)[:limit]
        )

        # Missing required modules per test (midterm vs normal).
        for t in PracticeTest.objects.select_related("mock_exam").prefetch_related("modules").all().iterator(chunk_size=200):
            required = required_module_orders_for_test(t)
            existing = {m.module_order for m in list(t.modules.all())}
            if 1 in required and 1 not in existing:
                missing_m1.append(t.pk)
            if 2 in required and 2 not in existing:
                missing_m2.append(t.pk)

        # Duplicate module_order within a PracticeTest.
        dups = (
            Module.objects.values("practice_test_id", "module_order")
            .annotate(c=Count("id"))
            .filter(c__gt=1)
        )
        for row in dups[:limit]:
            dup_orders.append(
                {
                    "practice_test_id": row["practice_test_id"],
                    "module_order": row["module_order"],
                    "count": row["c"],
                }
            )

        # Modules with zero questions.
        zero_q = (
            Module.objects.annotate(qc=Count("questions"))
            .filter(qc=0)
            .values_list("id", flat=True)[:limit]
        )

        report["tests"] = {
            "practice_tests_missing_module_1": {"count": len(missing_m1), "ids": missing_m1[:limit]},
            "practice_tests_missing_module_2": {"count": len(missing_m2), "ids": missing_m2[:limit]},
            "duplicate_module_orders": {"count": dups.count(), "rows": dup_orders},
            "modules_invalid_module_order": {"count": Module.objects.exclude(module_order__in=[1, 2]).count(), "ids": list(invalid_order)},
            "modules_non_positive_time_limit": {"count": Module.objects.filter(time_limit_minutes__lte=0).count(), "ids": list(non_positive_timer)},
            "modules_with_zero_questions": {"count": Module.objects.annotate(qc=Count("questions")).filter(qc=0).count(), "ids": list(zero_q)},
        }

        # ── Attempts integrity ──────────────────────────────────────────────
        impossible_ids: list[int] = []
        codes_counter = defaultdict(int)
        codes_samples: dict[str, list[int]] = defaultdict(list)

        qs = (
            TestAttempt.objects.select_related("practice_test", "current_module", "practice_test__mock_exam")
            .prefetch_related("completed_modules")
            .all()
        )
        for att in qs.iterator(chunk_size=200):
            findings = audit_attempt_invariants(att)
            if not findings:
                continue
            impossible_ids.append(att.pk)
            for f in findings:
                codes_counter[f.code] += 1
                if len(codes_samples[f.code]) < limit:
                    codes_samples[f.code].append(att.pk)

        report["attempts"] = {
            "attempts_with_impossible_state": {"count": len(impossible_ids), "ids": impossible_ids[:limit]},
            "finding_counts_by_code": dict(sorted(codes_counter.items(), key=lambda x: (-x[1], x[0]))),
            "finding_sample_attempt_ids_by_code": dict(codes_samples),
        }

        # Attempts with current_state active but no current_module (common stuck symptom).
        active_null = TestAttempt.objects.filter(
            current_state__in=[TestAttempt.STATE_MODULE_1_ACTIVE, TestAttempt.STATE_MODULE_2_ACTIVE],
            current_module__isnull=True,
            is_completed=False,
        ).values_list("id", flat=True)[:limit]
        report["attempts"]["active_state_with_null_current_module"] = {
            "count": TestAttempt.objects.filter(
                current_state__in=[TestAttempt.STATE_MODULE_1_ACTIVE, TestAttempt.STATE_MODULE_2_ACTIVE],
                current_module__isnull=True,
                is_completed=False,
            ).count(),
            "ids": list(active_null),
        }

        # ── Mock exam relations ─────────────────────────────────────────────
        # Broken relations are mostly prevented by FKs, but we can still flag suspicious configs.
        midterm_bad = list(
            MockExam.objects.filter(kind=MockExam.KIND_MIDTERM)
            .annotate(test_count=Count("tests"))
            .filter(~Q(test_count=1))
            .values_list("id", flat=True)[:limit]
        )
        report["mock_exams"] = {
            "midterms_without_exactly_one_section_test": {
                "count": MockExam.objects.filter(kind=MockExam.KIND_MIDTERM).annotate(test_count=Count("tests")).filter(~Q(test_count=1)).count(),
                "ids": midterm_bad,
            },
            "sections_with_mock_exam_but_no_portal_listing": {
                "count": PracticeTest.objects.filter(mock_exam__isnull=False, mock_exam__portal_listing__isnull=True).count(),
                "practice_test_ids": list(
                    PracticeTest.objects.filter(mock_exam__isnull=False, mock_exam__portal_listing__isnull=True).values_list("id", flat=True)[:limit]
                ),
            },
        }

        if as_json:
            self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
            return

        self.stdout.write("EXAM INTEGRITY AUDIT")
        self.stdout.write(json.dumps(report, indent=2, sort_keys=True))

