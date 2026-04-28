from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from exams.models import Module, PracticeTest, TestAttempt


class ScoringTransitionTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="student_score",
            email="student_score@example.com",
            password="pw",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

        self.test = PracticeTest.objects.create(
            subject="READING_WRITING",
            title="RW section",
            form_type="INTERNATIONAL",
            skip_default_modules=True,
        )
        Module.objects.create(practice_test=self.test, module_order=1, time_limit_minutes=1)
        Module.objects.create(practice_test=self.test, module_order=2, time_limit_minutes=1)

    def test_submit_module2_enters_scoring_and_sets_timestamp(self):
        a = self.client.post("/api/exams/attempts/", {"practice_test": self.test.id}, format="json").data
        attempt_id = a["id"]
        # Submit module 1 -> module 2 active
        r1 = self.client.post(f"/api/exams/attempts/{attempt_id}/submit_module/", {"answers": {}, "flagged": []}, format="json")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.data.get("current_state"), TestAttempt.STATE_MODULE_2_ACTIVE)

        # Submit module 2 -> scoring
        r2 = self.client.post(f"/api/exams/attempts/{attempt_id}/submit_module/", {"answers": {}, "flagged": []}, format="json")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data.get("current_state"), TestAttempt.STATE_SCORING)

        att = TestAttempt.objects.get(pk=attempt_id)
        self.assertEqual(att.current_state, TestAttempt.STATE_SCORING)
        self.assertIsNotNone(att.scoring_started_at)

