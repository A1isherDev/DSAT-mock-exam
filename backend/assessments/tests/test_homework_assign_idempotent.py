from __future__ import annotations

import threading

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from access import constants as acc_const
from assessments.models import AssessmentQuestion, AssessmentSet, HomeworkAssignment
from classes.models import Classroom, ClassroomMembership


class HomeworkAssignRaceTests(TransactionTestCase):
    """
    Concurrency regression tests: ensure homework assign is idempotent under retries/races.
    """

    reset_sequences = True

    def setUp(self):
        User = get_user_model()
        self.teacher = User.objects.create_user(
            email="tmath_race@example.com",
            password="x",
            role=acc_const.ROLE_TEACHER,
            subject=acc_const.DOMAIN_MATH,
        )

        self.classroom = Classroom.objects.create(
            title="Math class",
            subject=Classroom.SUBJECT_MATH,
            created_by=self.teacher,
            teacher=self.teacher,
        )
        ClassroomMembership.objects.create(
            classroom=self.classroom,
            user=self.teacher,
            role=ClassroomMembership.ROLE_ADMIN,
        )

        self.aset = AssessmentSet.objects.create(
            subject=AssessmentSet.SUBJECT_MATH,
            category="algebra",
            title="Algebra set",
            created_by=self.teacher,
            is_active=True,
        )
        AssessmentQuestion.objects.create(
            assessment_set=self.aset,
            order=1,
            prompt="2+2?",
            question_type=AssessmentQuestion.TYPE_NUMERIC,
            correct_answer=4,
            points=1,
            is_active=True,
        )

    def _post_assign(self, *, barrier: threading.Barrier, out: list, idx: int):
        c = APIClient()
        c.force_authenticate(self.teacher)
        barrier.wait(timeout=5)
        resp = c.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.classroom.id, "set_id": self.aset.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        out[idx] = {"status": resp.status_code, "json": resp.json() if hasattr(resp, "json") else None}

    def test_concurrent_assign_creates_single_homework_row(self):
        barrier = threading.Barrier(2)
        out = [None, None]
        t1 = threading.Thread(target=self._post_assign, kwargs={"barrier": barrier, "out": out, "idx": 0})
        t2 = threading.Thread(target=self._post_assign, kwargs={"barrier": barrier, "out": out, "idx": 1})
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        for r in out:
            self.assertIsNotNone(r)
            self.assertEqual(r["status"], 201)

        # DB must contain exactly one homework assignment for (classroom, set).
        self.assertEqual(
            HomeworkAssignment.objects.filter(classroom=self.classroom, assessment_set=self.aset).count(),
            1,
        )

