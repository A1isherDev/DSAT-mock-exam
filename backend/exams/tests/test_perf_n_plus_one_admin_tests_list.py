from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from access import constants as acc_const
from exams.models import Module, PracticeTest, Question
from exams.question_ordering import assign_question_to_module_dense_locked

User = get_user_model()

_ALLOWED_FOR_SUBDOMAIN_TESTS = (
    "testserver",
    "localhost",
    "127.0.0.1",
    "questions.mastersat.uz",
)
_QUESTIONS_HOST = {"HTTP_HOST": "questions.mastersat.uz"}


@override_settings(ALLOWED_HOSTS=list(_ALLOWED_FOR_SUBDOMAIN_TESTS))
class AdminTestsListNPlusOneTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.test_admin = User.objects.create_user(
            email="ta-perf@example.com",
            password="pw",
            role=acc_const.ROLE_TEST_ADMIN,
        )

    def test_admin_tests_list_query_count_bounded(self):
        self.client.force_authenticate(user=self.test_admin)

        # Seed a moderate amount of data that would explode under N+1.
        for i in range(8):
            pt = PracticeTest.objects.create(
                subject="MATH",
                form_type="INTERNATIONAL",
                mock_exam=None,
                title=f"PT {i}",
                skip_default_modules=True,
            )
            m1 = Module.objects.create(practice_test=pt, module_order=1, time_limit_minutes=35)
            m2 = Module.objects.create(practice_test=pt, module_order=2, time_limit_minutes=35)
            for j in range(5):
                q1 = Question.objects.create(question_type="MATH", question_text=f"Q{i}-1-{j}", correct_answers="a")
                assign_question_to_module_dense_locked(module_id=m1.id, question=q1, insert_at=j)
                q2 = Question.objects.create(question_type="MATH", question_text=f"Q{i}-2-{j}", correct_answers="a")
                assign_question_to_module_dense_locked(module_id=m2.id, question=q2, insert_at=j)

        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get("/api/exams/admin/tests/", **_QUESTIONS_HOST)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        # This endpoint should not scale linearly with the number of tests/modules/questions.
        # The exact number varies across DB engines; keep a generous upper bound.
        self.assertLessEqual(len(ctx), 40, f"Too many queries for admin tests list: {len(ctx)}")

