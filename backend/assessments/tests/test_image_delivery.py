"""
Regression: assessment question IMAGES must be delivered to students on the
snapshot-pinned (published/frozen) attempt-bundle and review paths.

Snapshots do not pin images, so the frozen delivery paths supplement image URLs
from the live AssessmentQuestion rows (freeze-safe: django-cleanup is absent, so
published image files are never deleted). Before the fix, frozen assessments
delivered no images and figures/diagrams were invisible to students.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from assessments.models import AssessmentAttempt, AssessmentQuestion
from assessments.domain.publish_service import publish_assessment_set

from .test_replay_certification import (
    make_teacher, make_student, make_classroom, make_set, make_mc_question, make_hw,
)
from classes.models import ClassroomMembership

User = get_user_model()


class FrozenImageDeliveryTests(APITestCase):
    def setUp(self):
        self.teacher = make_teacher()
        self.student = make_student()
        self.room = make_classroom(self.teacher)
        ClassroomMembership.objects.create(
            classroom=self.room, user=self.student, role=ClassroomMembership.ROLE_STUDENT
        )
        self.aset = make_set(self.teacher)
        self.q = make_mc_question(self.aset, order=1, correct="A")
        # Attach image references (names only — no real files needed for URL resolution).
        self.q.question_image.name = "assessments/q1_diagram.png"
        self.q.option_a_image.name = "assessments/q1_opt_a.png"
        self.q.save()

        self.version = publish_assessment_set(set_id=self.aset.pk, actor=self.teacher)
        self.hw = make_hw(self.room, self.aset, self.teacher, version=self.version)

    def _make_attempt(self):
        return AssessmentAttempt.objects.create(
            homework=self.hw,
            student=self.student,
            set_version=self.version,
            question_order=[self.q.pk],
            grading_status=AssessmentAttempt.GRADING_PENDING,
            last_activity_at=timezone.now(),
        )

    def test_bundle_delivers_question_and_option_images(self):
        att = self._make_attempt()
        self.client.force_authenticate(self.student)
        url = reverse("assessment-attempt-bundle", args=[att.pk])
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        q = next(x for x in res.data["questions"] if x["id"] == self.q.pk)
        self.assertTrue(q.get("question_image"), "frozen bundle must deliver question_image")
        self.assertIn("q1_diagram.png", q["question_image"])
        self.assertIn("q1_opt_a.png", q["option_a_image"])
        # An option with no image stays null (not missing).
        self.assertIsNone(q["option_b_image"])

    def test_review_delivers_images(self):
        att = self._make_attempt()
        att.status = AssessmentAttempt.STATUS_SUBMITTED
        att.save(update_fields=["status"])
        self.client.force_authenticate(self.student)
        url = reverse("assessment-attempt-pedagogical-review", args=[att.pk])
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        q = next(x for x in res.data["questions"] if x["id"] == self.q.pk)
        self.assertIn("q1_diagram.png", q.get("question_image") or "")
