"""Security-critical tests for RBAC + ``UserAccess`` helpers."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from access import constants as C
from access.exceptions import SubjectContractViolation
from access.models import UserAccess
from access.services import (
    authorize,
    has_access_for_classroom,
    has_global_subject_access,
    student_has_any_subject_grant,
)

User = get_user_model()


class AccessPrimitivesTests(TestCase):
    def setUp(self):
        self.math_teacher = User.objects.create_user(
            email="t_math@example.com",
            password="x",
            role=C.ROLE_TEACHER,
            subject=C.DOMAIN_MATH,
        )
        UserAccess.objects.create(
            user=self.math_teacher,
            subject=C.DOMAIN_MATH,
            classroom=None,
            granted_by=self.math_teacher,
        )
        self.english_teacher = User.objects.create_user(
            email="t_en@example.com",
            password="x",
            role=C.ROLE_TEACHER,
            subject=C.DOMAIN_ENGLISH,
        )
        UserAccess.objects.create(
            user=self.english_teacher,
            subject=C.DOMAIN_ENGLISH,
            classroom=None,
            granted_by=self.english_teacher,
        )

    def test_teacher_cannot_pass_english_authorize_with_math_subject(self):
        self.assertFalse(
            authorize(
                self.math_teacher,
                C.PERM_MANAGE_TESTS,
                subject=C.SUBJECT_ENGLISH_PLATFORM,
            )
        )

    def test_domain_permissions_require_explicit_subject(self):
        self.assertFalse(authorize(self.math_teacher, C.PERM_MANAGE_TESTS))
        self.assertTrue(
            authorize(self.math_teacher, C.PERM_MANAGE_TESTS, subject=C.SUBJECT_MATH_PLATFORM)
        )

    def test_global_access_requires_null_classroom_row_for_student(self):
        student = User.objects.create_user(
            email="st@example.com",
            password="x",
            role=C.ROLE_STUDENT,
        )
        UserAccess.objects.create(
            user=student,
            subject=C.DOMAIN_MATH,
            classroom=None,
            granted_by=None,
        )
        self.assertTrue(has_global_subject_access(student, C.DOMAIN_MATH))
        self.assertTrue(student_has_any_subject_grant(student, C.DOMAIN_MATH))

        only_class = User.objects.create_user(
            email="st2@example.com",
            password="x",
            role=C.ROLE_STUDENT,
        )
        from classes.models import Classroom

        c = Classroom.objects.create(
            name="M",
            subject=Classroom.SUBJECT_MATH,
            lesson_days=Classroom.DAYS_ODD,
            created_by=self.math_teacher,
        )
        UserAccess.objects.create(
            user=only_class,
            subject=C.DOMAIN_MATH,
            classroom=c,
            granted_by=None,
        )
        self.assertFalse(has_global_subject_access(only_class, C.DOMAIN_MATH))
        self.assertTrue(student_has_any_subject_grant(only_class, C.DOMAIN_MATH))
        self.assertTrue(has_access_for_classroom(only_class, C.DOMAIN_MATH, c.pk))

    def test_student_global_and_any_grant_alignment(self):
        student = User.objects.create_user(
            email="st3@example.com",
            password="x",
            role=C.ROLE_STUDENT,
        )
        UserAccess.objects.create(
            user=student,
            subject=C.DOMAIN_ENGLISH,
            classroom=None,
            granted_by=None,
        )
        self.assertTrue(student_has_any_subject_grant(student, C.DOMAIN_ENGLISH))
        self.assertTrue(has_global_subject_access(student, C.DOMAIN_ENGLISH))

    def test_authorize_rejects_domain_string_as_subject(self):
        with self.assertRaises(SubjectContractViolation):
            authorize(
                self.math_teacher,
                C.PERM_MANAGE_TESTS,
                subject=C.DOMAIN_MATH,
            )

    def test_authorize_rejects_unknown_platform_subject(self):
        with self.assertRaises(SubjectContractViolation):
            authorize(self.math_teacher, C.PERM_MANAGE_TESTS, subject="BIOLOGY")

    def test_has_global_rejects_platform_string(self):
        with self.assertRaises(SubjectContractViolation):
            has_global_subject_access(self.math_teacher, C.SUBJECT_MATH_PLATFORM)

    def test_cross_subject_db_row_ignored_for_teacher(self):
        """Subject gate runs before trusting rows in another subject (defensive)."""
        UserAccess.objects.create(
            user=self.math_teacher,
            subject=C.DOMAIN_ENGLISH,
            classroom=None,
            granted_by=self.math_teacher,
        )
        self.assertFalse(has_global_subject_access(self.math_teacher, C.DOMAIN_ENGLISH))

    def test_test_admin_requires_matching_domain_for_manage_tests(self):
        ta_math = User.objects.create_user(
            email="ta_math@example.com",
            password="x",
            role=C.ROLE_TEST_ADMIN,
            subject=C.DOMAIN_MATH,
        )
        UserAccess.objects.create(
            user=ta_math,
            subject=C.DOMAIN_MATH,
            classroom=None,
            granted_by=ta_math,
        )
        self.assertTrue(
            authorize(ta_math, C.PERM_MANAGE_TESTS, subject=C.SUBJECT_MATH_PLATFORM)
        )
        self.assertFalse(
            authorize(ta_math, C.PERM_MANAGE_TESTS, subject=C.SUBJECT_ENGLISH_PLATFORM)
        )
