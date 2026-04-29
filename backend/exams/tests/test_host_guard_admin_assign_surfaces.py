from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from access import constants as acc_const


User = get_user_model()

_ALLOWED_SUBDOMAIN_HOSTS = (
    "localhost",
    "127.0.0.1",
    "testserver",
    "admin.mastersat.uz",
    "questions.mastersat.uz",
)

_ADMIN_HOST = {"HTTP_HOST": "admin.mastersat.uz"}


@override_settings(ALLOWED_HOSTS=list(_ALLOWED_SUBDOMAIN_HOSTS))
class AdminAssignHostGuardSurfaceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin_assign_host@example.com",
            password="x",
            role=acc_const.ROLE_ADMIN,
        )

    def test_admin_host_allows_exams_bulk_assign_endpoint(self):
        """
        Host guard must allow /api/exams/bulk_assign on admin.* (DRF permissions decide auth).
        """
        self.client.force_authenticate(user=self.admin)
        r = self.client.post(
            "/api/exams/bulk_assign/",
            data={"user_ids": [], "exam_ids": [], "practice_test_ids": []},
            format="json",
            **_ADMIN_HOST,
        )
        # Endpoint is allowed by host guard. Permission may still deny (403), but it must not be
        # the host-guard “not available on admin subdomain” response.
        self.assertIn(r.status_code, (400, 403))
        detail = str((r.json() or {}).get("detail") or "")
        self.assertNotIn("not available on admin subdomain", detail.lower())

