from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from exams.models import Module, PracticeTest, TestAttempt


class IntegrityCommandDryRunTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="student_dry",
            email="student_dry@example.com",
            password="pw",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

    def test_repair_exam_integrity_dry_run_does_not_mutate(self):
        # Create a deliberately inconsistent attempt (legal at DB level).
        test = PracticeTest.objects.create(
            subject="READING_WRITING",
            title="RW section",
            form_type="INTERNATIONAL",
            skip_default_modules=True,
        )
        m1 = Module.objects.create(practice_test=test, module_order=1, time_limit_minutes=1)
        Module.objects.create(practice_test=test, module_order=2, time_limit_minutes=1)
        att = TestAttempt.objects.create(student=self.user, practice_test=test)
        # Put into an impossible persisted state that the repair command would normally fix.
        att.current_state = TestAttempt.STATE_MODULE_1_ACTIVE
        att.current_module = None
        att.save(update_fields=["current_state", "current_module"])

        before = TestAttempt.objects.get(pk=att.pk)
        call_command("repair_exam_integrity", dry_run=True, json=True, verbosity=0)
        after = TestAttempt.objects.get(pk=att.pk)

        self.assertEqual(before.current_state, after.current_state)
        self.assertEqual(before.current_module_id, after.current_module_id)
        self.assertEqual(before.is_completed, after.is_completed)

