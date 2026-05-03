from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from exams.models import PracticeTest, Module, TestAttempt


@override_settings(CELERY_TASK_ALWAYS_EAGER=False, EXAMS_SCORE_INLINE_IF_NO_CELERY=False)
def _rewind_m1_timer(attempt_pk: int) -> None:
    """Timer anchor for module 1 is ``module_1_started_at`` (not only ``current_module_start_time``)."""
    past = timezone.now() - timezone.timedelta(minutes=5)
    TestAttempt.objects.filter(pk=attempt_pk).update(
        module_1_started_at=past,
        current_module_start_time=past,
    )


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

        self.test = PracticeTest.objects.create(
            subject="MATH",
            form_type="INTERNATIONAL",
            skip_default_modules=True,
        )
        self.m1 = Module.objects.create(practice_test=self.test, module_order=1, time_limit_minutes=1)
        self.m2 = Module.objects.create(practice_test=self.test, module_order=2, time_limit_minutes=1)

    def _create_attempt_and_start_m1(self) -> TestAttempt:
        att = TestAttempt.objects.create(student=self.user, practice_test=self.test)
        att.start_module(self.m1)
        return TestAttempt.objects.get(pk=att.pk)

    def test_autosave_rejected_when_module_expired(self):
        att = self._create_attempt_and_start_m1()
        _rewind_m1_timer(att.pk)

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "A"}, "flagged": []},
            format="json",
        )
        # Timeout behavior: autosave will auto-submit and return canonical state.
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.get("is_expired"))

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

    def test_explicit_submit_rejected_when_module_deadline_passed(self):
        att = self._create_attempt_and_start_m1()
        _rewind_m1_timer(att.pk)

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/submit_module/",
            {"answers": {}, "flagged": []},
            format="json",
        )
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data.get("code"), "exam_module_deadline_passed")
        self.assertIn("attempt", r.data)

    def test_deadline_via_save_attempt_auto_advances_via_server_timer(self):
        att = self._create_attempt_and_start_m1()
        _rewind_m1_timer(att.pk)

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "A"}, "flagged": []},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.get("is_expired"))
        self.assertEqual(r.data.get("current_state"), TestAttempt.STATE_MODULE_2_ACTIVE)

