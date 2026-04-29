from __future__ import annotations

from django.db import connection
from django.test import TestCase


class DBIndexExistenceTests(TestCase):
    def test_test_attempt_fk_indexes_exist(self):
        """
        Performance baseline: FK lookups on attempts should be indexed.
        """
        constraints = connection.introspection.get_constraints(connection.cursor(), "test_attempts")

        def has_index_on(col: str) -> bool:
            for _, c in constraints.items():
                if not c.get("index"):
                    continue
                cols = list(c.get("columns") or [])
                if cols == [col]:
                    return True
            return False

        # Django typically creates indexes for FKs; enforce to avoid slow filtering in hot paths.
        self.assertTrue(has_index_on("student_id"), "Missing index on test_attempts.student_id")
        self.assertTrue(has_index_on("practice_test_id"), "Missing index on test_attempts.practice_test_id")

