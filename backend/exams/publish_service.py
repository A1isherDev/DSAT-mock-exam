"""Rules for publishing a mock exam to students (portal + practice visibility)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    from .models import MockExam


def mock_exam_publish_ready(exam: "MockExam") -> Tuple[bool, str]:
    """
    Full SAT mock: exactly R&W + Math, each with 2 modules, every module has ≥1 question.
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
            if m.questions.count() < 1:
                return False, f"Module {m.module_order} must have at least one question."
        return True, ""

    # MOCK_SAT
    if len(tests) != 2:
        return False, "Full mock must have exactly two sections: Reading & Writing and Math."
    subs = {t.subject for t in tests}
    if subs != {"READING_WRITING", "MATH"}:
        return False, "Full mock must include exactly one Reading & Writing and one Math section."

    for pt in tests:
        mods = list(pt.modules.all().order_by("module_order"))
        if len(mods) < 2:
            return False, f"{pt.get_subject_display()} needs 2 modules (SAT-style)."
        for m in mods[:2]:
            if m.questions.count() < 1:
                return False, f"{pt.get_subject_display()} module {m.module_order} needs at least one question."
    return True, ""
