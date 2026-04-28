from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from exams.models import PracticeTest


class AttemptStaleOwnerContractTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user_a = User.objects.create_user(
            username="a",
            email="a@example.com",
            password="pw",
            is_staff=True,
            is_superuser=True,
        )
        self.user_b = User.objects.create_user(
            username="b",
            email="b@example.com",
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

    def test_wrong_owner_attempt_id_is_404_but_user_can_start_own_attempt(self):
        # User A starts attempt.
        self.client.force_authenticate(self.user_a)
        a = self.client.post("/api/exams/attempts/", {"practice_test": self.test.id}, format="json")
        self.assertIn(a.status_code, (200, 201))
        attempt_id = a.data["id"]

        # User B cannot fetch A's attempt via detail route (should be a 404 by queryset scoping).
        self.client.force_authenticate(self.user_b)
        r = self.client.get(f"/api/exams/attempts/{attempt_id}/status/")
        self.assertEqual(r.status_code, 404)

        # But B can still start/resume their own attempt (no coupling to stale id).
        b = self.client.post("/api/exams/attempts/", {"practice_test": self.test.id}, format="json")
        self.assertIn(b.status_code, (200, 201))
        self.assertNotEqual(b.data["id"], attempt_id)

