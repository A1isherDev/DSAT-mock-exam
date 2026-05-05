"""
Shared test helpers: HTTP hosts aligned with ``access.host_guard`` and minimal
``Question`` rows so ``PracticeTest`` matches ``modules__questions__`` lookups
used when starting attempts (see ``TestAttemptViewSet.create``).
"""

from __future__ import annotations

from exams.models import Module, Question

# Mirrors production consoles (see ``access.host_guard.SubdomainAPIGuardMiddleware``).
MAIN_HOST: dict[str, str] = {}
STUDENT_API_HOST = {"HTTP_HOST": "testserver"}
ADMIN_API_HOST = {"HTTP_HOST": "admin.mastersat.uz"}
QUESTIONS_API_HOST = {"HTTP_HOST": "questions.mastersat.uz"}

ALLOWED_SUBDOMAIN_HOSTS = (
    "localhost",
    "127.0.0.1",
    "testserver",
    "admin.mastersat.uz",
    "questions.mastersat.uz",
)


def _question_type_for_module(module: Module) -> str:
    subj = getattr(module.practice_test, "subject", None)
    if subj == "MATH":
        return "MATH"
    return "READING"


def seed_mc_question(module: Module, *, stem: str = "Question text", order: int = 0) -> Question:
    """Minimal MC row (two options + letter answer) for attempt-create eligibility."""
    return Question.objects.create(
        module=module,
        question_type=_question_type_for_module(module),
        question_text=stem,
        option_a="Choice A",
        option_b="Choice B",
        correct_answers="a",
        order=order,
    )


def seed_mc_questions_for_practice_test(practice_test, *, questions_per_module: int = 1) -> None:
    """Ensure each module has at least one question so POST /api/exams/attempts/ can resolve the test."""
    for mod in Module.objects.filter(practice_test=practice_test).order_by("module_order"):
        for i in range(questions_per_module):
            seed_mc_question(
                mod,
                stem=f"Q pt={practice_test.pk} mod={mod.module_order} i={i}",
                order=i,
            )
