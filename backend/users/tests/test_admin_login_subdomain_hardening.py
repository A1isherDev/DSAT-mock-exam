from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, Client, override_settings

from access import constants as acc_const

User = get_user_model()

_ALLOWED = (
    "testserver",
    "localhost",
    "127.0.0.1",
    "admin.mastersat.uz",
)


@override_settings(ALLOWED_HOSTS=list(_ALLOWED))
class AdminLoginSubdomainHardeningTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.admin = User.objects.create_user(email="admin-login@example.com", password="pw", role=acc_const.ROLE_ADMIN)

    def test_admin_login_requires_csrf_and_sets_cookies_and_me_works(self):
        host = "admin.mastersat.uz"

        # 1) Issue CSRF cookie
        r0 = self.client.get("/api/auth/csrf/", HTTP_HOST=host)
        self.assertEqual(r0.status_code, 200)
        csrf = self.client.cookies.get("csrftoken").value
        self.assertTrue(csrf)

        # 2) Login without CSRF header should fail
        r_bad = self.client.post(
            "/api/auth/login/?include_tokens=1",
            data={"email": self.admin.email, "password": "pw", "remember_me": 1},
            content_type="application/json",
            HTTP_HOST=host,
            HTTP_ORIGIN=f"https://{host}",
        )
        self.assertEqual(r_bad.status_code, 403)

        # 3) Login with CSRF header should succeed and set HttpOnly cookies
        r1 = self.client.post(
            "/api/auth/login/?include_tokens=1",
            data={"email": self.admin.email, "password": "pw", "remember_me": 1},
            content_type="application/json",
            HTTP_HOST=host,
            HTTP_ORIGIN=f"https://{host}",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(r1.status_code, 200)
        self.assertIn("lms_access", r1.cookies)
        self.assertIn("lms_refresh", r1.cookies)

        # 4) /users/me should work immediately after login
        r2 = self.client.get("/api/users/me/", HTTP_HOST=host)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(str(r2.json().get("role") or "").lower(), "admin")

    def test_admin_refresh_requires_csrf(self):
        host = "admin.mastersat.uz"
        self.client.get("/api/auth/csrf/", HTTP_HOST=host)
        csrf = self.client.cookies.get("csrftoken").value

        # Login first
        r1 = self.client.post(
            "/api/auth/login/?include_tokens=1",
            data={"email": self.admin.email, "password": "pw", "remember_me": 1},
            content_type="application/json",
            HTTP_HOST=host,
            HTTP_ORIGIN=f"https://{host}",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(r1.status_code, 200)

        # Refresh without CSRF header should fail
        r_bad = self.client.post(
            "/api/auth/refresh/",
            data={},
            content_type="application/json",
            HTTP_HOST=host,
            HTTP_ORIGIN=f"https://{host}",
        )
        self.assertEqual(r_bad.status_code, 403)

        # Refresh with CSRF header should succeed
        r_ok = self.client.post(
            "/api/auth/refresh/",
            data={},
            content_type="application/json",
            HTTP_HOST=host,
            HTTP_ORIGIN=f"https://{host}",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(r_ok.status_code, 200)
        self.assertIn("lms_access", r_ok.cookies)

