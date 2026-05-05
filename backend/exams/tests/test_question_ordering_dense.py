from __future__ import annotations

from django.test import TestCase

from exams.models import Module, PracticeTest, Question


class QuestionOrderingDenseTests(TestCase):
    def setUp(self):
        self.pt = PracticeTest.objects.create(
            subject="MATH",
            title="Ordering test",
            form_type="INTERNATIONAL",
            mock_exam=None,
            skip_default_modules=True,
        )
        self.mod = Module.objects.create(
            practice_test=self.pt,
            module_order=1,
            time_limit_minutes=35,
        )

    def test_create_appends_dense_zero_based(self):
        a = Question.objects.create(
            module=self.mod,
            question_type="MATH",
            question_text="A",
            correct_answers="1",
            order=0,
        )
        b = Question.objects.create(
            module=self.mod,
            question_type="MATH",
            question_text="B",
            correct_answers="2",
            order=1,
        )
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.order, 0)
        self.assertEqual(b.order, 1)
        self.mod.refresh_from_db()
        self.assertEqual(self.mod.question_order_high_water, 1)

    def test_insert_at_index_shifts_others(self):
        Question.objects.create(
            module=self.mod,
            question_type="MATH",
            question_text="A",
            correct_answers="1",
            order=0,
        )
        Question.objects.create(
            module=self.mod,
            question_type="MATH",
            question_text="B",
            correct_answers="2",
            order=1,
        )
        c = Question(
            module=self.mod,
            question_type="MATH",
            question_text="C",
            correct_answers="3",
            order=0,
        )
        c.save()
        orders = list(
            Question.objects.filter(module=self.mod).order_by("order", "id").values_list(
                "question_text", "order"
            )
        )
        self.assertEqual(orders, [("C", 0), ("A", 1), ("B", 2)])
