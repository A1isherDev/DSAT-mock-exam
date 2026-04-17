from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from classes.models import (
    Classroom,
    ClassroomMembership,
    ClassPost,
    Assignment,
    Submission,
    assignment_target_practice_test_ids,
)
from classes.serializers import AssignmentSerializer

User = get_user_model()


class AssignmentTargetIdsTests(TestCase):
    def test_practice_test_ids_skips_bad_entries(self):
        admin = User.objects.create_user("targets@test.com", "secret123")
        c = Classroom.objects.create(
            name="T",
            subject=Classroom.SUBJECT_ENGLISH,
            lesson_days=Classroom.DAYS_ODD,
            created_by=admin,
        )
        a = Assignment.objects.create(
            classroom=c,
            created_by=admin,
            title="t",
            practice_test_ids=[1, "2", "x", None],
        )
        self.assertEqual(assignment_target_practice_test_ids(a), [1, 2])


class AssignmentPracticeAccessSyncTests(TestCase):
    """Homework targeting standalone practice tests must add class students to assigned_users."""

    def setUp(self):
        from exams.models import PracticeTest

        self.admin = User.objects.create_user("apas_admin@test.com", "secret123")
        self.student = User.objects.create_user("apas_student@test.com", "secret123")
        self.classroom = Classroom.objects.create(
            name="C",
            subject=Classroom.SUBJECT_ENGLISH,
            lesson_days=Classroom.DAYS_ODD,
            created_by=self.admin,
        )
        ClassroomMembership.objects.create(
            classroom=self.classroom, user=self.admin, role=ClassroomMembership.ROLE_ADMIN
        )
        ClassroomMembership.objects.create(
            classroom=self.classroom, user=self.student, role=ClassroomMembership.ROLE_STUDENT
        )
        self.pt = PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=None,
            subject="READING_WRITING",
            title="Standalone section",
        )

    def test_create_assignment_adds_students_to_practice_test_assigned_users(self):
        ser = AssignmentSerializer(data={"title": "Pastpaper HW", "practice_test": self.pt.pk})
        ser.is_valid(raise_exception=True)
        ser.save(classroom=self.classroom, created_by=self.admin)
        self.assertTrue(self.pt.assigned_users.filter(pk=self.student.pk).exists())


class ClassroomSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("admin_scope@test.com", "secret123")
        self.other = User.objects.create_user("other_scope@test.com", "secret123")
        self.student = User.objects.create_user("student_scope@test.com", "secret123")

        self.classroom = Classroom.objects.create(
            name="Scoped class",
            subject=Classroom.SUBJECT_ENGLISH,
            lesson_days=Classroom.DAYS_ODD,
            created_by=self.admin,
        )
        ClassroomMembership.objects.create(
            classroom=self.classroom, user=self.admin, role=ClassroomMembership.ROLE_ADMIN
        )
        ClassroomMembership.objects.create(
            classroom=self.classroom, user=self.student, role=ClassroomMembership.ROLE_STUDENT
        )

        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            created_by=self.admin,
            title="HW1",
        )
        self.submission = Submission.objects.create(
            assignment=self.assignment,
            student=self.student,
            status=Submission.STATUS_SUBMITTED,
        )

    def test_submissions_list_forbidden(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/classes/submissions/")
        self.assertEqual(r.status_code, 403)

    def test_submission_detail_requires_class_admin(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/classes/submissions/{self.submission.pk}/")
        self.assertEqual(r.status_code, 200)

        self.client.force_authenticate(self.other)
        r2 = self.client.get(f"/api/classes/submissions/{self.submission.pk}/")
        self.assertEqual(r2.status_code, 403)

    def test_student_cannot_delete_announcement(self):
        post = ClassPost.objects.create(
            classroom=self.classroom,
            author=self.admin,
            content="<p>Hello</p>",
        )
        self.client.force_authenticate(self.student)
        r = self.client.delete(f"/api/classes/{self.classroom.pk}/posts/{post.pk}/")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(ClassPost.objects.filter(pk=post.pk).exists())
