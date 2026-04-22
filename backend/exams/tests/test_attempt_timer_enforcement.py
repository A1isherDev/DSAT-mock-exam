from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from exams.models import PracticeTest, Module, TestAttempt


@override_settings(CELERY_TASK_ALWAYS_EAGER=False, EXAMS_SCORE_INLINE_IF_NO_CELERY=False)
class AttemptTimerEnforcementTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="student_timer",
            email="student_timer@example.com",
            password="pw12345678",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

        self.test = PracticeTest.objects.create(subject="MATH", form_type="INTERNATIONAL")
        self.m1 = Module.objects.create(practice_test=self.test, module_order=1, time_limit_minutes=1)
        self.m2 = Module.objects.create(practice_test=self.test, module_order=2, time_limit_minutes=1)

    def _create_attempt_and_start_m1(self) -> TestAttempt:
        att = TestAttempt.objects.create(student=self.user, practice_test=self.test)
        att.start_module(self.m1)
        return TestAttempt.objects.get(pk=att.pk)

    def test_autosave_rejected_when_module_expired(self):
        att = self._create_attempt_and_start_m1()
        # Force expiry by rewinding start time.
        TestAttempt.objects.filter(pk=att.pk).update(
            current_module_start_time=timezone.now() - timezone.timedelta(minutes=5)
        )

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "A"}, "flagged": []},
            format="json",
        )
        self.assertEqual(r.status_code, 409)

    def test_autosave_idempotency_replay(self):
        att = self._create_attempt_and_start_m1()
        headers = {"HTTP_IDEMPOTENCY_KEY": "save-1"}
        r1 = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "A"}, "flagged": []},
            format="json",
            **headers,
        )
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "B"}, "flagged": []},
            format="json",
            **headers,
        )
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r1.data, r2.data)

    def test_submit_allowed_when_module_expired_but_marks_expired(self):
        att = self._create_attempt_and_start_m1()
        TestAttempt.objects.filter(pk=att.pk).update(
            current_module_start_time=timezone.now() - timezone.timedelta(minutes=5)
        )

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/submit_module/",
            {"answers": {}, "flagged": []},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.get("is_expired"))

