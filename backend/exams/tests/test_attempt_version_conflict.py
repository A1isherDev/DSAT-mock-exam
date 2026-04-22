from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from exams.models import PracticeTest, Module, TestAttempt


@override_settings(CELERY_TASK_ALWAYS_EAGER=False, EXAMS_SCORE_INLINE_IF_NO_CELERY=False)
class AttemptVersionConflictTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="student_conflict",
            email="student_conflict@example.com",
            password="pw12345678",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

        self.test = PracticeTest.objects.create(subject="MATH", form_type="INTERNATIONAL")
        self.m1 = Module.objects.create(practice_test=self.test, module_order=1, time_limit_minutes=35)
        self.m2 = Module.objects.create(practice_test=self.test, module_order=2, time_limit_minutes=35)

    def test_save_attempt_version_conflict_returns_409(self):
        att = TestAttempt.objects.create(student=self.user, practice_test=self.test)
        att.start_module(self.m1)
        att = TestAttempt.objects.get(pk=att.pk)
        correct_v = att.version_number

        # Simulate an update by bumping version
        TestAttempt.objects.filter(pk=att.pk).update(version_number=correct_v + 1)

        r = self.client.post(
            f"/api/exams/attempts/{att.pk}/save_attempt/",
            {"answers": {"1": "A"}, "flagged": [], "expected_version_number": correct_v},
            format="json",
        )
        self.assertEqual(r.status_code, 409)
        self.assertIn("attempt", r.data)

