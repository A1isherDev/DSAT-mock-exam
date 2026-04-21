from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from access import constants as acc_const
from classes.models import Classroom, ClassroomMembership
from assessments.models import AssessmentSet, AssessmentQuestion


User = get_user_model()


class AssessmentsSecurityMatrixTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.teacher_math = User.objects.create_user(
            email="tmath@example.com",
            password="x",
            role=acc_const.ROLE_TEACHER,
            subject=acc_const.DOMAIN_MATH,
        )
        self.teacher_eng = User.objects.create_user(
            email="teng@example.com",
            password="x",
            role=acc_const.ROLE_TEACHER,
            subject=acc_const.DOMAIN_ENGLISH,
        )
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="x",
            role=acc_const.ROLE_ADMIN,
        )
        self.test_admin = User.objects.create_user(
            email="testadmin@example.com",
            password="x",
            role=acc_const.ROLE_TEST_ADMIN,
        )

        # Classrooms
        self.class_math = Classroom.objects.create(
            title="Math class",
            subject=Classroom.SUBJECT_MATH,
            created_by=self.teacher_math,
            teacher=self.teacher_math,
        )
        ClassroomMembership.objects.create(
            classroom=self.class_math, user=self.teacher_math, role=ClassroomMembership.ROLE_ADMIN
        )

        self.class_eng = Classroom.objects.create(
            title="English class",
            subject=Classroom.SUBJECT_ENGLISH,
            created_by=self.teacher_eng,
            teacher=self.teacher_eng,
        )
        ClassroomMembership.objects.create(
            classroom=self.class_eng, user=self.teacher_eng, role=ClassroomMembership.ROLE_ADMIN
        )

        # Global staff can be class admin too (for assignment console).
        ClassroomMembership.objects.create(
            classroom=self.class_math, user=self.admin, role=ClassroomMembership.ROLE_ADMIN
        )
        ClassroomMembership.objects.create(
            classroom=self.class_math, user=self.test_admin, role=ClassroomMembership.ROLE_ADMIN
        )

        # Assessment sets
        self.set_math = AssessmentSet.objects.create(
            subject=AssessmentSet.SUBJECT_MATH,
            category="algebra",
            title="Algebra set",
            created_by=self.teacher_math,
            is_active=True,
        )
        AssessmentQuestion.objects.create(
            assessment_set=self.set_math,
            order=1,
            prompt="2+2?",
            question_type=AssessmentQuestion.TYPE_NUMERIC,
            correct_answer=4,
            points=1,
            is_active=True,
        )

        self.set_eng = AssessmentSet.objects.create(
            subject=AssessmentSet.SUBJECT_ENGLISH,
            category="grammar",
            title="Grammar set",
            created_by=self.teacher_eng,
            is_active=True,
        )
        AssessmentQuestion.objects.create(
            assessment_set=self.set_eng,
            order=1,
            prompt="Select article",
            question_type=AssessmentQuestion.TYPE_MULTIPLE_CHOICE,
            choices=[{"id": "A", "text": "a"}, {"id": "B", "text": "an"}],
            correct_answer="B",
            points=1,
            is_active=True,
        )

    def test_teacher_list_sets_scoped_to_own_subject(self):
        self.client.force_authenticate(user=self.teacher_math)
        resp = self.client.get(
            "/api/assessments/admin/sets/?subject=english",
            HTTP_HOST="questions.mastersat.uz",
        )
        self.assertEqual(resp.status_code, 200)
        ids = {row["id"] for row in resp.json()}
        self.assertIn(self.set_math.id, ids)
        self.assertNotIn(self.set_eng.id, ids)

    def test_global_staff_list_sets_all_subjects(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/assessments/admin/sets/", HTTP_HOST="admin.mastersat.uz")
        self.assertEqual(resp.status_code, 200)
        ids = {row["id"] for row in resp.json()}
        self.assertIn(self.set_math.id, ids)
        self.assertIn(self.set_eng.id, ids)

    def test_admin_subdomain_blocks_authoring_writes(self):
        self.client.force_authenticate(user=self.test_admin)
        resp = self.client.post(
            "/api/assessments/admin/sets/",
            data={"subject": "math", "category": "x", "title": "New set", "description": "", "is_active": True},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(resp.status_code, 403)

    def test_questions_subdomain_allows_authoring_writes_for_test_admin(self):
        self.client.force_authenticate(user=self.test_admin)
        resp = self.client.post(
            "/api/assessments/admin/sets/",
            data={"subject": "math", "category": "x", "title": "New set", "description": "", "is_active": True},
            format="json",
            HTTP_HOST="questions.mastersat.uz",
        )
        self.assertEqual(resp.status_code, 201)

    def test_assignment_requires_can_assign_and_teacher_ownership(self):
        self.client.force_authenticate(user=self.teacher_math)
        # Teacher assigns within own class/subject: ok.
        ok = self.client.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.class_math.id, "set_id": self.set_math.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(ok.status_code, 201)

        # Teacher tries to assign into someone else's classroom: denied.
        bad_owner = self.client.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.class_eng.id, "set_id": self.set_eng.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(bad_owner.status_code, 403)

        # Teacher tries to assign other-subject set into own class: denied.
        bad_subject = self.client.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.class_math.id, "set_id": self.set_eng.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(bad_subject.status_code, 403)

    def test_student_cannot_assign_or_list(self):
        st = User.objects.create_user(email="st@example.com", password="x", role=acc_const.ROLE_STUDENT)
        ClassroomMembership.objects.create(
            classroom=self.class_math, user=st, role=ClassroomMembership.ROLE_STUDENT
        )
        self.client.force_authenticate(user=st)

        lst = self.client.get("/api/assessments/admin/sets/", HTTP_HOST="admin.mastersat.uz")
        self.assertIn(lst.status_code, (403, 401))

        resp = self.client.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.class_math.id, "set_id": self.set_math.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_without_class_admin_membership_cannot_assign(self):
        # Remove the teacher_math admin membership; ownership alone is not enough.
        ClassroomMembership.objects.filter(
            classroom=self.class_math, user=self.teacher_math
        ).delete()
        self.client.force_authenticate(user=self.teacher_math)
        resp = self.client.post(
            "/api/assessments/homework/assign/",
            data={"classroom_id": self.class_math.id, "set_id": self.set_math.id, "title": "HW"},
            format="json",
            HTTP_HOST="admin.mastersat.uz",
        )
        self.assertEqual(resp.status_code, 403)

