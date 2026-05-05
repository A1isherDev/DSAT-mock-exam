from __future__ import annotations

import threading
import unittest

import django.db
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from exams.models import Module, PracticeTest, TestAttempt
from exams.tests.support import seed_mc_questions_for_practice_test


class AttemptActiveUniquenessRaceTests(TransactionTestCase):
    """
    Concurrency regression tests: ensure attempt creation is idempotent under races.
    Uses TransactionTestCase so threads run in real transactions.
    """

    reset_sequences = True

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="student_race",
            email="student_race@example.com",
            password="pw",
            is_staff=True,
            is_superuser=True,
        )
        self.test = PracticeTest.objects.create(
            subject="READING_WRITING",
            title="RW section",
            form_type="INTERNATIONAL",
            skip_default_modules=True,
        )
        Module.objects.create(practice_test=self.test, module_order=1, time_limit_minutes=1)
        Module.objects.create(practice_test=self.test, module_order=2, time_limit_minutes=1)
        seed_mc_questions_for_practice_test(self.test)

    def _post_create_attempt(self, *, barrier: threading.Barrier, out: list, idx: int):
        c = APIClient()
        c.force_authenticate(self.user)
        barrier.wait(timeout=5)
        resp = c.post("/api/exams/attempts/", {"practice_test": self.test.id}, format="json")
        out[idx] = {"status": resp.status_code, "data": getattr(resp, "data", None)}

    @unittest.skipUnless(
        django.db.connection.vendor == "postgresql",
        "Concurrent attempt-create races require PostgreSQL (SQLite locks under threads).",
    )
    def test_concurrent_create_returns_single_active_attempt(self):
        barrier = threading.Barrier(2)
        out = [None, None]
        t1 = threading.Thread(target=self._post_create_attempt, kwargs={"barrier": barrier, "out": out, "idx": 0})
        t2 = threading.Thread(target=self._post_create_attempt, kwargs={"barrier": barrier, "out": out, "idx": 1})
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        for r in out:
            self.assertIsNotNone(r)
            self.assertIn(r["status"], (200, 201))
            self.assertIsInstance(r["data"], dict)
            self.assertIn("id", r["data"])

        attempt_ids = {out[0]["data"]["id"], out[1]["data"]["id"]}
        # Both requests must converge on a single canonical attempt.
        self.assertEqual(len(attempt_ids), 1)

        active = (
            TestAttempt.objects.filter(student=self.user, practice_test=self.test, is_completed=False)
            .exclude(current_state=TestAttempt.STATE_ABANDONED)
            .count()
        )
        self.assertEqual(active, 1)

