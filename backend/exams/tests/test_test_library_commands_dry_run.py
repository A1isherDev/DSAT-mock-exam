from __future__ import annotations

from django.core.management import call_command
from django.test import TestCase

from exams.models import PastpaperPack, PracticeTest


class TestLibraryCommandDryRunTests(TestCase):
    def test_repair_test_library_integrity_dry_run_does_not_mutate(self):
        pack = PastpaperPack.objects.create(
            title="Pack",
            practice_date="2024-01-01",
            form_type="INTERNATIONAL",
            label="A",
        )
        sec = PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=pack,
            subject="MATH",
            title="Section",
            label="B",  # mismatch
            form_type="US",  # mismatch
            practice_date="2025-01-01",  # mismatch
            skip_default_modules=True,
        )

        before = PracticeTest.objects.get(pk=sec.pk)
        call_command("repair_test_library_integrity", dry_run=True, json=True, verbosity=0)
        after = PracticeTest.objects.get(pk=sec.pk)

        self.assertEqual(before.practice_date, after.practice_date)
        self.assertEqual(before.form_type, after.form_type)
        self.assertEqual(before.label, after.label)

