from __future__ import annotations

from django.db import connection
from django.test import TestCase


class AssessmentsDBIndexExistenceTests(TestCase):
    def test_homework_assignment_fk_indexes_exist(self):
        """
        Performance baseline: homework list/detail filters should be indexed.
        """
        constraints = connection.introspection.get_constraints(connection.cursor(), "assessment_homework_assignments")

        def has_index_on(col: str) -> bool:
            for _, c in constraints.items():
                if not c.get("index"):
                    continue
                cols = list(c.get("columns") or [])
                if cols == [col]:
                    return True
            return False

        self.assertTrue(has_index_on("classroom_id"), "Missing index on homework_assignments.classroom_id")
        self.assertTrue(has_index_on("assessment_set_id"), "Missing index on homework_assignments.assessment_set_id")

