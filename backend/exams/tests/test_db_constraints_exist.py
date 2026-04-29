from __future__ import annotations

from django.db import connection
from django.test import TestCase


class DBConstraintExistenceTests(TestCase):
    def test_test_attempt_unique_active_constraint_exists(self):
        """
        Critical invariant: at most one active attempt per (student, practice_test).
        """
        constraints = connection.introspection.get_constraints(connection.cursor(), "test_attempts")
        self.assertIn("uniq_active_attempt_per_student_test", constraints)
        self.assertTrue(constraints["uniq_active_attempt_per_student_test"].get("unique"))

