from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from access import constants as acc_const
from exams.models import PastpaperPack, PracticeTest
from exams.tests.support import seed_mc_questions_for_practice_test

User = get_user_model()

_ALLOWED_FOR_SUBDOMAIN_TESTS = (
    "testserver",
    "localhost",
    "127.0.0.1",
    "admin.mastersat.uz",
    "questions.mastersat.uz",
)
_ADMIN_HOST = {"HTTP_HOST": "admin.mastersat.uz"}
_QUESTIONS_HOST = {"HTTP_HOST": "questions.mastersat.uz"}


@override_settings(ALLOWED_HOSTS=list(_ALLOWED_FOR_SUBDOMAIN_TESTS))
class PastpaperSystemHardeningTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.test_admin = User.objects.create_user(
            email="pp_test_admin@example.com",
            password="pw",
            role=acc_const.ROLE_TEST_ADMIN,
        )
        self.admin = User.objects.create_user(
            email="pp_admin@example.com",
            password="pw",
            role=acc_const.ROLE_ADMIN,
        )
        self.student = User.objects.create_user(
            email="pp_student@example.com",
            password="pw",
            role=acc_const.ROLE_STUDENT,
        )

    def test_test_admin_can_create_pack_add_sections_and_edit_section(self):
        self.client.force_authenticate(user=self.test_admin)

        pack = self.client.post(
            "/api/exams/admin/pastpaper-packs/",
            data={"title": "Pack 1", "practice_date": "2024-10-01", "label": "A", "form_type": "INTERNATIONAL"},
            format="json",
            **_QUESTIONS_HOST,
        )
        self.assertEqual(pack.status_code, 201, pack.content)
        pack_id = int(pack.json()["id"])

        s1 = self.client.post(
            f"/api/exams/admin/pastpaper-packs/{pack_id}/add_section/",
            data={"subject": "MATH", "title": "Math Section"},
            format="json",
            **_QUESTIONS_HOST,
        )
        self.assertEqual(s1.status_code, 201, s1.content)
        section_id = int(s1.json()["id"])

        dup = self.client.post(
            f"/api/exams/admin/pastpaper-packs/{pack_id}/add_section/",
            data={"subject": "MATH", "title": "Math Section 2"},
            format="json",
            **_QUESTIONS_HOST,
        )
        self.assertEqual(dup.status_code, 400, dup.content)

        patched = self.client.patch(
            f"/api/exams/admin/tests/{section_id}/",
            data={"title": "Math Section (edited)"},
            format="json",
            **_QUESTIONS_HOST,
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        self.assertEqual(PracticeTest.objects.get(pk=section_id).title, "Math Section (edited)")

    def test_admin_can_browse_packs_on_admin_host(self):
        pack = PastpaperPack.objects.create(title="Visible pack", form_type="INTERNATIONAL")
        PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=pack,
            subject="MATH",
            form_type="INTERNATIONAL",
            title="Pack Math",
            skip_default_modules=True,
        )
        self.client.force_authenticate(user=self.admin)
        r = self.client.get("/api/exams/admin/pastpaper-packs/", **_ADMIN_HOST)
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_admin_can_assign_pastpaper_section_and_student_can_start(self):
        # Create a pack section
        pack = PastpaperPack.objects.create(title="Assign pack", form_type="INTERNATIONAL")
        section = PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=pack,
            subject="MATH",
            form_type="INTERNATIONAL",
            title="Assign Section",
            skip_default_modules=False,
        )
        seed_mc_questions_for_practice_test(section)

        # Assign via canonical bulk-assign endpoint (admin host)
        self.client.force_authenticate(user=self.admin)
        assign = self.client.post(
            "/api/exams/bulk_assign/",
            data={"user_ids": [self.student.pk], "practice_test_ids": [section.pk], "exam_ids": [], "assignment_type": "FULL"},
            format="json",
            **_ADMIN_HOST,
        )
        self.assertIn(assign.status_code, (200, 201), assign.content)

        # Student can start attempt on main host
        self.client.force_authenticate(user=self.student)
        start = self.client.post("/api/exams/attempts/", data={"practice_test": section.pk}, format="json", HTTP_HOST="testserver")
        self.assertIn(start.status_code, (200, 201), start.content)
        self.assertTrue(start.json().get("id"))

