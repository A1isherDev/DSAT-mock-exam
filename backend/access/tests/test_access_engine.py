"""
Comprehensive tests for the centralized access engine (Phase 2).

Covers: grant constraints/dedup, manual + bulk assignment, transactional
classroom assignment (incl. rollback), visibility (subject OR resource, expiry,
revocation), lifecycle (revoke/extend/expire), dual-write mirroring, and
backfill + parity.

Run:
    python manage.py test access.tests.test_access_engine \
        --settings=config.settings_test_nomigrations
"""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from access import constants as C
from access import resources
from access.engine import (
    AccessService,
    AssignmentService,
    ClassroomAccessService,
    VisibilityService,
)
from access.models import AccessGrantEvent, ResourceAccessGrant, UserAccess
from classes.models import Classroom, ClassroomMembership
from exams.models import MockExam, PracticeTest

User = get_user_model()


def make_student(email):
    return User.objects.create_user(email=email, password="x", role=C.ROLE_STUDENT)


class GrantConstraintTests(TestCase):
    def setUp(self):
        self.u = make_student("gc@example.com")

    def test_subject_grant_dedup_idempotent(self):
        g1 = AccessService.grant_subject(self.u, C.DOMAIN_MATH)
        g2 = AccessService.grant_subject(self.u, C.DOMAIN_MATH)
        self.assertEqual(g1.pk, g2.pk)
        self.assertEqual(
            ResourceAccessGrant.objects.filter(scope="SUBJECT", status="ACTIVE").count(), 1
        )

    def test_resource_grant_dedup_idempotent(self):
        g1 = AccessService.grant_resource(self.u, resources.RT_PRACTICE_TEST, 123)
        g2 = AccessService.grant_resource(self.u, resources.RT_PRACTICE_TEST, 123)
        self.assertEqual(g1.pk, g2.pk)

    def test_partial_unique_blocks_duplicate_active(self):
        AccessService.grant_subject(self.u, C.DOMAIN_MATH)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ResourceAccessGrant.objects.create(
                    user=self.u, scope="SUBJECT", subject=C.DOMAIN_MATH, status="ACTIVE"
                )

    def test_scope_shape_check_constraint(self):
        # SUBJECT grant must not carry resource_* fields.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ResourceAccessGrant.objects.create(
                    user=self.u, scope="SUBJECT", subject=C.DOMAIN_MATH,
                    resource_type="practice_test", resource_id=1, status="ACTIVE",
                )

    def test_grant_writes_audit_event(self):
        g = AccessService.grant_subject(self.u, C.DOMAIN_MATH)
        ev = AccessGrantEvent.objects.get(grant=g)
        self.assertEqual(ev.action, AccessGrantEvent.ACTION_GRANTED)
        self.assertEqual(ev.snapshot["subject"], C.DOMAIN_MATH)


class AssignmentServiceTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user(email="adm@example.com", password="x", role=C.ROLE_ADMIN)
        self.students = [make_student(f"as{i}@example.com") for i in range(5)]

    def test_assign_subject_validates(self):
        with self.assertRaises(ValidationError):
            AssignmentService.assign_subject(self.students[0], "physics")

    def test_bulk_assign_resource_creates_and_skips(self):
        r1 = AssignmentService.bulk_assign_resource(
            self.students, resources.RT_PRACTICE_TEST, 99, actor=self.actor, require_exists=False
        )
        self.assertEqual(r1["created"], 5)
        self.assertEqual(r1["skipped"], 0)
        # Re-run is idempotent.
        r2 = AssignmentService.bulk_assign_resource(
            self.students, resources.RT_PRACTICE_TEST, 99, actor=self.actor, require_exists=False
        )
        self.assertEqual(r2["created"], 0)
        self.assertEqual(r2["skipped"], 5)
        self.assertEqual(
            AccessGrantEvent.objects.filter(action=AccessGrantEvent.ACTION_GRANTED).count(), 5
        )

    def test_bulk_assign_resource_is_constant_query_count(self):
        # Should NOT scale with number of users (fixes legacy per-student loop).
        many = [make_student(f"perf{i}@example.com") for i in range(20)]
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        with CaptureQueriesContext(connection) as ctx:
            AssignmentService.bulk_assign_resource(
                many, resources.RT_PRACTICE_TEST, 77, actor=self.actor, require_exists=False
            )
        # A small constant number of queries regardless of 20 users.
        self.assertLess(len(ctx.captured_queries), 12, [q["sql"] for q in ctx.captured_queries])

    def test_revoke_resource(self):
        AssignmentService.assign_resource(
            self.students[0], resources.RT_PRACTICE_TEST, 5, require_exists=False
        )
        n = AssignmentService.revoke_resource(self.students[0], resources.RT_PRACTICE_TEST, 5)
        self.assertEqual(n, 1)
        self.assertFalse(
            ResourceAccessGrant.objects.filter(
                user=self.students[0], status="ACTIVE", resource_id=5
            ).exists()
        )


class ClassroomServiceTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="t@example.com", password="x", role=C.ROLE_TEACHER, subject=C.DOMAIN_MATH
        )
        self.classroom = Classroom.objects.create(
            name="C1", subject=Classroom.SUBJECT_MATH,
            lesson_days=Classroom.DAYS_ODD, created_by=self.teacher,
        )
        self.students = [make_student(f"cs{i}@example.com") for i in range(3)]
        for s in self.students:
            ClassroomMembership.objects.create(
                classroom=self.classroom, user=s, role=ClassroomMembership.ROLE_STUDENT
            )

    def test_assign_resource_to_classroom_grants_all_students(self):
        res = ClassroomAccessService.assign_resource_to_classroom(
            self.classroom, resources.RT_PRACTICE_TEST, 42, actor=self.teacher, require_exists=False
        )
        self.assertEqual(res["created"], 3)
        for s in self.students:
            self.assertTrue(
                VisibilityService.can_access(s, resources.RT_PRACTICE_TEST, 42)
            )
        self.assertEqual(
            ResourceAccessGrant.objects.filter(
                source=ResourceAccessGrant.SOURCE_CLASSROOM, classroom=self.classroom
            ).count(),
            3,
        )

    def test_classroom_assignment_is_transactional_rollback(self):
        # If audit insert fails mid-way, NO grants should remain (all-or-nothing).
        with mock.patch.object(
            AccessGrantEvent.objects, "bulk_create", side_effect=RuntimeError("boom")
        ):
            with self.assertRaises(RuntimeError):
                ClassroomAccessService.assign_resource_to_classroom(
                    self.classroom, resources.RT_PRACTICE_TEST, 43,
                    actor=self.teacher, require_exists=False,
                )
        self.assertEqual(
            ResourceAccessGrant.objects.filter(resource_id=43).count(), 0,
            "partial classroom assignment must roll back entirely",
        )

    def test_on_student_enrolled_backfills_existing_assignments(self):
        ClassroomAccessService.assign_resource_to_classroom(
            self.classroom, resources.RT_PRACTICE_TEST, 50, actor=self.teacher, require_exists=False
        )
        newbie = make_student("late@example.com")
        ClassroomMembership.objects.create(
            classroom=self.classroom, user=newbie, role=ClassroomMembership.ROLE_STUDENT
        )
        ClassroomAccessService.on_student_enrolled(self.classroom, newbie)
        self.assertTrue(VisibilityService.can_access(newbie, resources.RT_PRACTICE_TEST, 50))


class VisibilityTests(TestCase):
    def setUp(self):
        self.student = make_student("vis@example.com")
        self.pt = PracticeTest.objects.create(
            subject="MATH", form_type="INTERNATIONAL", skip_default_modules=True
        )

    def test_no_grant_denied(self):
        self.assertFalse(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_resource_grant_grants(self):
        AccessService.grant_resource(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        self.assertTrue(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_subject_grant_covers_resource(self):
        AccessService.grant_subject(self.student, C.DOMAIN_MATH)
        self.assertTrue(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_wrong_subject_grant_does_not_cover(self):
        AccessService.grant_subject(self.student, C.DOMAIN_ENGLISH)
        self.assertFalse(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_expired_resource_grant_denied(self):
        AccessService.grant_resource(
            self.student, resources.RT_PRACTICE_TEST, self.pt.pk,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_revoked_grant_denied(self):
        g = AccessService.grant_resource(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        AccessService.revoke(g)
        self.assertFalse(
            VisibilityService.can_access(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

    def test_filter_visible_for_student(self):
        pt2 = PracticeTest.objects.create(
            subject="MATH", form_type="INTERNATIONAL", skip_default_modules=True
        )
        AccessService.grant_resource(self.student, resources.RT_PRACTICE_TEST, self.pt.pk)
        visible = VisibilityService.filter_visible(
            self.student, resources.RT_PRACTICE_TEST, PracticeTest.objects.all()
        )
        ids = set(visible.values_list("pk", flat=True))
        self.assertIn(self.pt.pk, ids)
        self.assertNotIn(pt2.pk, ids)

    def test_filter_visible_subject_coverage(self):
        AccessService.grant_subject(self.student, C.DOMAIN_MATH)
        visible = VisibilityService.filter_visible(
            self.student, resources.RT_PRACTICE_TEST, PracticeTest.objects.all()
        )
        self.assertIn(self.pt.pk, set(visible.values_list("pk", flat=True)))


class LifecycleTests(TestCase):
    def setUp(self):
        self.u = make_student("life@example.com")

    def test_expire_due(self):
        past = AccessService.grant_resource(
            self.u, resources.RT_PRACTICE_TEST, 1, expires_at=timezone.now() - timedelta(minutes=1)
        )
        future = AccessService.grant_resource(
            self.u, resources.RT_PRACTICE_TEST, 2, expires_at=timezone.now() + timedelta(days=1)
        )
        n = AccessService.expire_due()
        self.assertEqual(n, 1)
        past.refresh_from_db()
        future.refresh_from_db()
        self.assertEqual(past.status, ResourceAccessGrant.STATUS_EXPIRED)
        self.assertEqual(future.status, ResourceAccessGrant.STATUS_ACTIVE)
        self.assertTrue(
            AccessGrantEvent.objects.filter(grant=past, action=AccessGrantEvent.ACTION_EXPIRED).exists()
        )

    def test_extend_reactivates_expired(self):
        g = AccessService.grant_resource(
            self.u, resources.RT_PRACTICE_TEST, 3, expires_at=timezone.now() - timedelta(minutes=1)
        )
        AccessService.expire_due()
        g.refresh_from_db()
        self.assertEqual(g.status, ResourceAccessGrant.STATUS_EXPIRED)
        AccessService.extend(g, expires_at=timezone.now() + timedelta(days=5))
        g.refresh_from_db()
        self.assertEqual(g.status, ResourceAccessGrant.STATUS_ACTIVE)


class DualWriteTests(TestCase):
    def setUp(self):
        self.u = make_student("dw@example.com")
        self.pt = PracticeTest.objects.create(
            subject="MATH", form_type="INTERNATIONAL", skip_default_modules=True
        )

    @override_settings(ACCESS_ENGINE_DUAL_WRITE=False)
    def test_flag_off_no_mirror(self):
        UserAccess.objects.create(user=self.u, subject=C.DOMAIN_MATH)
        self.pt.assigned_users.add(self.u)
        self.assertEqual(ResourceAccessGrant.objects.count(), 0)

    @override_settings(ACCESS_ENGINE_DUAL_WRITE=True)
    def test_subject_mirror_on_user_access(self):
        UserAccess.objects.create(user=self.u, subject=C.DOMAIN_MATH)
        self.assertTrue(
            ResourceAccessGrant.objects.filter(
                user=self.u, scope="SUBJECT", subject=C.DOMAIN_MATH, status="ACTIVE"
            ).exists()
        )

    @override_settings(ACCESS_ENGINE_DUAL_WRITE=True)
    def test_resource_mirror_on_assigned_users(self):
        self.pt.assigned_users.add(self.u)
        self.assertTrue(
            VisibilityService.can_access(self.u, resources.RT_PRACTICE_TEST, self.pt.pk)
        )
        # Removal mirrors to revocation.
        self.pt.assigned_users.remove(self.u)
        self.assertFalse(
            VisibilityService.can_access(self.u, resources.RT_PRACTICE_TEST, self.pt.pk)
        )


class BackfillParityTests(TestCase):
    def setUp(self):
        self.u = make_student("bf@example.com")
        self.pt = PracticeTest.objects.create(
            subject="MATH", form_type="INTERNATIONAL", skip_default_modules=True
        )

    def test_backfill_idempotent_and_parity(self):
        # Legacy state (dual-write OFF so only the backfill writes grants).
        UserAccess.objects.create(user=self.u, subject=C.DOMAIN_MATH)
        other = make_student("bf2@example.com")
        self.pt.assigned_users.add(other)

        call_command("access_backfill", verbosity=0)
        self.assertTrue(
            ResourceAccessGrant.objects.filter(user=self.u, scope="SUBJECT", subject=C.DOMAIN_MATH).exists()
        )
        self.assertTrue(
            VisibilityService.can_access(other, resources.RT_PRACTICE_TEST, self.pt.pk)
        )

        before = ResourceAccessGrant.objects.count()
        call_command("access_backfill", verbosity=0)
        self.assertEqual(ResourceAccessGrant.objects.count(), before, "backfill must be idempotent")

        # Parity check should pass after backfill.
        try:
            call_command("access_parity_check", "--resource-type", "practice_test", verbosity=0)
        except CommandError as e:  # pragma: no cover
            self.fail(f"parity check failed unexpectedly: {e}")

    def test_backfill_undo(self):
        UserAccess.objects.create(user=self.u, subject=C.DOMAIN_MATH)
        call_command("access_backfill", verbosity=0)
        self.assertGreater(ResourceAccessGrant.objects.count(), 0)
        call_command("access_backfill", "--undo", verbosity=0)
        self.assertEqual(
            ResourceAccessGrant.objects.filter(source=ResourceAccessGrant.SOURCE_SYSTEM).count(), 0
        )
