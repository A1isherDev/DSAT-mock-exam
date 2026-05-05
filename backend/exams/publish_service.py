"""Rules for publishing a timed mock to the student portal (separate from pastpaper practice)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    from .models import MockExam


def mock_exam_publish_ready(exam: "MockExam") -> Tuple[bool, str]:
    """
    Full SAT mock: at least one section; each section needs ≥1 module with ≥1 question.
    Midterm: one section, 1–2 modules per settings, each with ≥1 question.
    """

    from .models import MockExam

    tests = list(exam.tests.all())

    if exam.kind == MockExam.KIND_MIDTERM:
        if len(tests) != 1:
            return False, "Midterm must have exactly one section test."
        pt = tests[0]
        need_mods = max(1, min(2, exam.midterm_module_count or 1))
        mods = list(pt.modules.all().order_by("module_order"))
        if len(mods) < need_mods:
            return False, f"Add {need_mods} module(s) with questions for this midterm."
        for m in mods[:need_mods]:
            if m.module_questions.count() < 1:
                return False, f"Module {m.module_order} must have at least one question."
        return True, ""

    # MOCK_SAT — partial mocks allowed (single section or one module per section).
    if len(tests) < 1:
        return False, "Add at least one section test (Reading & Writing and/or Math)."

    for pt in tests:
        if pt.subject not in ("READING_WRITING", "MATH"):
            return False, "Each section must be Reading & Writing or Math."
        mods = list(pt.modules.all().order_by("module_order"))
        if len(mods) < 1:
            return False, f"{pt.get_subject_display()} needs at least one module."
        for m in mods:
            if m.module_questions.count() < 1:
                return False, f"{pt.get_subject_display()} module {m.module_order} needs at least one question."
    return True, ""
