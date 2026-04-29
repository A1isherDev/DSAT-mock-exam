from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from users.authentication import CookieOrHeaderJWTAuthentication

User = get_user_model()


class CookieJWTStepUpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="stepup_setting@example.com",
            password="x",
            role="test_admin",
        )

    def test_step_up_does_not_block_when_enforcement_disabled(self):
        self.user.security_step_up_required_until = timezone.now() + timedelta(hours=1)
        self.user.save(update_fields=["security_step_up_required_until"])

        auth = CookieOrHeaderJWTAuthentication()
        validated = MagicMock()

        with self._patch_super_user_returns(self.user):
            with override_settings(SECURITY_STEP_UP_ENFORCE_ON_JWT=False):
                self.assertIs(auth.get_user(validated), self.user)

    @override_settings(SECURITY_STEP_UP_ENFORCE_ON_JWT=True)
    def test_step_up_blocks_when_enforcement_enabled(self):
        self.user.security_step_up_required_until = timezone.now() + timedelta(hours=1)
        self.user.save(update_fields=["security_step_up_required_until"])

        auth = CookieOrHeaderJWTAuthentication()
        validated = MagicMock()

        with self._patch_super_user_returns(self.user):
            with self.assertRaises(AuthenticationFailed):
                auth.get_user(validated)

    @staticmethod
    def _patch_super_user_returns(user):
        return patch.object(JWTAuthentication, "get_user", return_value=user)

