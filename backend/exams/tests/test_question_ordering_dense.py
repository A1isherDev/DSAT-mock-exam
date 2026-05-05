from __future__ import annotations

from django.test import TestCase

from exams.models import Module, ModuleQuestion, PracticeTest, Question
from exams.question_ordering import assign_question_to_module_dense_locked


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
            question_type="MATH",
            question_text="A",
            correct_answers="1",
        )
        assign_question_to_module_dense_locked(module_id=self.mod.id, question=a, insert_at=0)
        b = Question.objects.create(
            question_type="MATH",
            question_text="B",
            correct_answers="2",
        )
        assign_question_to_module_dense_locked(module_id=self.mod.id, question=b, insert_at=1)
        links = list(
            ModuleQuestion.objects.filter(module=self.mod)
            .order_by("order", "id")
            .values_list("question_id", "order")
        )
        self.assertEqual(links, [(a.id, 0), (b.id, 1)])
        self.mod.refresh_from_db()
        self.assertEqual(self.mod.question_order_high_water, 1)

    def test_insert_at_index_shifts_others(self):
        a = Question.objects.create(
            question_type="MATH",
            question_text="A",
            correct_answers="1",
        )
        assign_question_to_module_dense_locked(module_id=self.mod.id, question=a, insert_at=0)
        b = Question.objects.create(
            question_type="MATH",
            question_text="B",
            correct_answers="2",
        )
        assign_question_to_module_dense_locked(module_id=self.mod.id, question=b, insert_at=1)
        c = Question(
            question_type="MATH",
            question_text="C",
            correct_answers="3",
        )
        c.save()
        assign_question_to_module_dense_locked(module_id=self.mod.id, question=c, insert_at=0)
        orders = list(
            ModuleQuestion.objects.filter(module=self.mod)
            .select_related("question")
            .order_by("order", "id")
            .values_list("question__question_text", "order")
        )
        self.assertEqual(orders, [("C", 0), ("A", 1), ("B", 2)])
