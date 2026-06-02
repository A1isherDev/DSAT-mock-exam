from django.test import TestCase

from questionbank.import_pipeline import create_batch_from_pages, promote_batch
from questionbank.import_validation import validate_parsed
from questionbank.models import BankQuestion, ImportCandidate, QuestionStatus
from questionbank.pdf_parser import parse_pages


# A single question whose rationale is split across TWO pages.
PAGE_1 = """Assessment SAT
Test: Math
Domain: Algebra
Skill: Linear functions
Difficulty: Medium

Question
If 2x + 3 = 11, what is the value of x?

A. 2
B. 4
C. 7
D. 8

Correct Answer: B

Rationale
Choice B is correct because subtracting 3 from both sides gives 2x = 8, and
1
"""

PAGE_2 = """2
dividing both sides by 2 yields x = 4. Choices A, C, and D are incorrect because
they result from arithmetic errors.

Assessment SAT
Test: Math
Domain: Algebra
Skill: Linear functions
Difficulty: Easy

Question
What is the slope of the line y = 5x - 2?

A. -2
B. 2
C. 5
D. 7

Correct Answer: C

Rationale
Choice C is correct because the equation is in slope-intercept form y = mx + b,
where m is the slope, so the slope is 5.
"""


class MultiPageRationaleTests(TestCase):
    def test_rationale_merges_across_page_break(self):
        questions = parse_pages([PAGE_1, PAGE_2])
        self.assertEqual(len(questions), 2)
        q1 = questions[0]
        # The explanation must include text from BOTH pages, with the bare page
        # numbers ("1", "2") stripped, and not be cut at the page boundary.
        self.assertIn("subtracting 3 from both sides", q1.explanation)
        self.assertIn("dividing both sides by 2 yields x = 4", q1.explanation)
        self.assertNotIn(" 1 ", f" {q1.explanation} ")
        self.assertEqual(q1.page_start, 1)
        self.assertEqual(q1.page_end, 2)
        # Boundary correctly detected: q1 stops where the next "Question" begins.
        self.assertNotIn("slope", q1.explanation)

    def test_fields_parsed(self):
        q1, q2 = parse_pages([PAGE_1, PAGE_2])
        self.assertEqual(q1.subject, "MATH")
        self.assertEqual(q1.raw_domain, "Algebra")
        self.assertEqual(q1.raw_skill, "Linear functions")
        self.assertEqual(q1.raw_difficulty, "Medium")
        self.assertEqual(q1.question_text, "If 2x + 3 = 11, what is the value of x?")
        self.assertEqual(q1.options["B"], "4")
        self.assertEqual(q1.correct_answer, "B")
        self.assertEqual(q2.correct_answer, "C")


class ValidationTests(TestCase):
    def test_missing_answer_is_error(self):
        (q,) = parse_pages([
            "Question\nWhat is 2+2?\nA. 3\nB. 4\nRationale\nIt is four.\n"
        ])
        status, messages = validate_parsed(q)
        self.assertEqual(status, ImportCandidate.Validation.ERROR)
        self.assertTrue(any("correct answer" in m.lower() for m in messages))

    def test_truncated_rationale_warns(self):
        (q,) = parse_pages([
            "Question\nPick one.\nA. x\nB. y\nCorrect Answer: A\n"
            "Rationale\nChoice A is correct because it is the only option that\n"
        ])
        status, messages = validate_parsed(q)
        self.assertEqual(status, ImportCandidate.Validation.WARNING)
        self.assertTrue(any("truncat" in m.lower() for m in messages))


class PipelineTests(TestCase):
    def test_batch_stage_and_promote_to_triage(self):
        batch = create_batch_from_pages([PAGE_1, PAGE_2], filename="sat_math.pdf")
        self.assertEqual(batch.candidates.count(), 2)
        self.assertEqual(
            batch.candidates.filter(validation_status=ImportCandidate.Validation.VALID).count(), 2
        )

        promoted = promote_batch(batch)
        self.assertEqual(promoted, 2)
        # Promoted questions land in TRIAGE, unclassified, with provenance.
        self.assertEqual(BankQuestion.objects.count(), 2)
        self.assertEqual(BankQuestion.objects.filter(status=QuestionStatus.TRIAGE).count(), 2)
        self.assertEqual(BankQuestion.objects.filter(domain__isnull=True).count(), 2)
        q = BankQuestion.objects.first()
        self.assertEqual(q.source_type, "PDF_IMPORT")
        self.assertEqual(q.source_reference, "sat_math.pdf")
        self.assertIsNotNone(q.current_version)

    def test_duplicate_detection_against_existing_bank(self):
        batch1 = create_batch_from_pages([PAGE_1, PAGE_2])
        promote_batch(batch1)
        # Re-import the same PDF → all candidates flagged DUPLICATE.
        batch2 = create_batch_from_pages([PAGE_1, PAGE_2])
        dups = batch2.candidates.filter(validation_status=ImportCandidate.Validation.DUPLICATE).count()
        self.assertEqual(dups, 2)
        # Promoting the duplicate batch creates no new bank rows.
        before = BankQuestion.objects.count()
        promote_batch(batch2)
        self.assertEqual(BankQuestion.objects.count(), before)

    def test_idempotent_promotion(self):
        batch = create_batch_from_pages([PAGE_1, PAGE_2])
        promote_batch(batch)
        n = BankQuestion.objects.count()
        promote_batch(batch)  # again
        self.assertEqual(BankQuestion.objects.count(), n)
