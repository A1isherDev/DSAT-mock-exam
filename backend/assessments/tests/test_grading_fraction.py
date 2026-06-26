"""Grading supports simple fractions (SAT grid-in style), e.g. correct "1/2" == "0.5"."""

from __future__ import annotations

from django.test import SimpleTestCase

from assessments.grading import grade_answer


class FractionGradingTests(SimpleTestCase):
    def _num(self, correct, answer, config=None):
        return grade_answer(question_type="numeric", correct_answer=correct, answer=answer, config=config or {})

    def test_fraction_correct_matches_decimal_answer(self):
        self.assertTrue(self._num("1/2", "0.5"))
        self.assertTrue(self._num("1/2", "1/2"))
        self.assertTrue(self._num("0.5", "1/2"))

    def test_fraction_three_quarters(self):
        self.assertTrue(self._num("3/4", "0.75"))
        self.assertTrue(self._num("3/4", "3/4"))

    def test_non_equivalent_fraction_is_wrong(self):
        self.assertFalse(self._num("1/3", "0.5"))
        self.assertFalse(self._num("1/2", "2/3"))

    def test_malformed_or_zero_denominator_is_not_correct(self):
        self.assertFalse(self._num("1/0", "0.5"))
        self.assertFalse(self._num("1/2", "1/0"))
        self.assertFalse(self._num("1/2", "abc"))

    def test_plain_numbers_still_grade(self):
        self.assertTrue(self._num("42", "42"))
        self.assertTrue(self._num(3.14, "3.14"))
        self.assertFalse(self._num("42", "43"))
