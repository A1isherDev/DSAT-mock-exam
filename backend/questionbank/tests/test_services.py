from django.test import TestCase

from questionbank.content_hash import compute_question_content_hash
from questionbank.models import BankQuestion, BankQuestionVersion, QbIdCounter, QuestionStatus, Subject
from questionbank.qb_id import allocate_qb_id, format_qb_id
from questionbank.services import create_bank_question, create_version


class QbIdTests(TestCase):
    def test_ids_are_monotonic_and_per_subject(self):
        self.assertEqual(allocate_qb_id(Subject.ENGLISH), "QB-ENG-000001")
        self.assertEqual(allocate_qb_id(Subject.ENGLISH), "QB-ENG-000002")
        self.assertEqual(allocate_qb_id(Subject.MATH), "QB-MATH-000001")
        self.assertEqual(QbIdCounter.objects.get(subject=Subject.ENGLISH).last_value, 2)

    def test_ids_never_reused_after_archive(self):
        q = create_bank_question(
            subject=Subject.ENGLISH, question_type="MULTIPLE_CHOICE", question_text="A?",
        )
        first_id = q.qb_id
        # A question can never be hard-deleted while versions exist (PROTECT) — it is
        # archived instead. The counter is monotonic regardless, so a new question
        # never reuses an old number.
        q.status = QuestionStatus.ARCHIVED
        q.save(update_fields=["status"])
        q2 = create_bank_question(
            subject=Subject.ENGLISH, question_type="MULTIPLE_CHOICE", question_text="B?",
        )
        self.assertNotEqual(first_id, q2.qb_id)
        self.assertEqual(q2.qb_id, "QB-ENG-000002")

    def test_format(self):
        self.assertEqual(format_qb_id(Subject.MATH, 42), "QB-MATH-000042")


class ContentHashTests(TestCase):
    def test_normalisation_stable_across_case_and_whitespace(self):
        h1 = compute_question_content_hash(question_text=" Hello  World ", options=["a", "b"], correct_answer="A")
        h2 = compute_question_content_hash(question_text="hello world", options=["A", "B"], correct_answer=["a"])
        self.assertEqual(h1, h2)

    def test_option_order_matters(self):
        h1 = compute_question_content_hash(question_text="q", options=["a", "b"], correct_answer="A")
        h2 = compute_question_content_hash(question_text="q", options=["b", "a"], correct_answer="A")
        self.assertNotEqual(h1, h2)


class VersioningTests(TestCase):
    def test_initial_version_created(self):
        q = create_bank_question(
            subject=Subject.MATH, question_type="MULTIPLE_CHOICE", question_text="2+2?",
            option_a="3", option_b="4", correct_answer="B",
        )
        self.assertIsNotNone(q.current_version)
        self.assertEqual(q.current_version.version_number, 1)
        self.assertTrue(q.content_hash)
        self.assertEqual(q.status, QuestionStatus.TRIAGE)

    def test_edit_creates_new_immutable_version_with_lineage(self):
        q = create_bank_question(
            subject=Subject.MATH, question_type="MULTIPLE_CHOICE", question_text="2+2?",
            option_a="3", option_b="4", correct_answer="B",
        )
        v1 = q.current_version
        q.explanation = "Because arithmetic."
        q.save(update_fields=["explanation"])
        v2 = create_version(q)
        q.refresh_from_db()
        self.assertEqual(v2.version_number, 2)
        self.assertEqual(v2.previous_version_id, v1.id)
        self.assertEqual(q.current_version_id, v2.id)
        # v1 snapshot is untouched (frozen) — old explanation preserved.
        self.assertNotEqual(v1.snapshot_json["content"]["explanation"], "Because arithmetic.")

    def test_versions_are_immutable_and_undeletable(self):
        q = create_bank_question(
            subject=Subject.ENGLISH, question_type="MULTIPLE_CHOICE", question_text="x?",
        )
        v = q.current_version
        with self.assertRaises(ValueError):
            v.snapshot_checksum = "tampered"
            v.save()
        with self.assertRaises(ValueError):
            v.delete()
