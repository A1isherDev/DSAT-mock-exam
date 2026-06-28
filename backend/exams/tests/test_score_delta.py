from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from exams.models import Module, PracticeTest, TestAttempt


class ReviewScoreDeltaTests(APITestCase):
    """The redesigned pastpaper result hero shows a "+N pts" chip, fed by
    `previous_score`/`score_delta` on the review payload — the delta vs the
    student's previous completed attempt of the SAME section."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="delta_student",
            email="delta@example.com",
            password="pw12345678",
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

    def _completed(self, score, completed_at):
        return TestAttempt.objects.create(
            practice_test=self.test,
            student=self.user,
            current_state=TestAttempt.STATE_COMPLETED,
            is_completed=True,
            score=score,
            module_answers={},
            completed_at=completed_at,
        )

    def test_delta_against_previous_completed_attempt(self):
        now = timezone.now()
        self._completed(500, now - timedelta(days=2))
        latest = self._completed(540, now)

        r = self.client.get(f"/api/exams/attempts/{latest.id}/review/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data.get("total_score"), 540)
        self.assertEqual(r.data.get("previous_score"), 500)
        self.assertEqual(r.data.get("score_delta"), 40)

    def test_no_delta_on_first_attempt(self):
        first = self._completed(500, timezone.now())
        r = self.client.get(f"/api/exams/attempts/{first.id}/review/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data.get("previous_score"))
        self.assertIsNone(r.data.get("score_delta"))

    def test_negative_delta_when_score_drops(self):
        now = timezone.now()
        self._completed(600, now - timedelta(days=1))
        latest = self._completed(540, now)
        r = self.client.get(f"/api/exams/attempts/{latest.id}/review/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data.get("score_delta"), -60)
