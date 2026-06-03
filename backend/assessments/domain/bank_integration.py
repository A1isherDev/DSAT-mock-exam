"""
M4 — Question Bank → Assessment Builder integration (ASSESSMENTS ONLY).

Assessments are the safest consumer to integrate first because they already
freeze content via immutable AssessmentSetVersion snapshots. This module does
NOT touch the attempt, grading, or review engines. It only:

  1. lets the builder create an AssessmentQuestion FROM an APPROVED bank question
     (copying content + recording the bank_question/bank_version link), and
  2. (in snapshot_builder) pins qb_id + version_number into the snapshot so a
     published assessment is frozen against future bank edits.

GATE: only status=APPROVED bank questions may be added. TRIAGE/IMPORTED/REJECTED/
ARCHIVED are never selectable.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Max

from questionbank.models import BankQuestion, QuestionStatus, QuestionType

# Bank question_type -> AssessmentQuestion.question_type
_TYPE_MAP = {
    QuestionType.MULTIPLE_CHOICE: "multiple_choice",
    QuestionType.STUDENT_PRODUCED: "numeric",
    QuestionType.NUMERIC: "numeric",
    QuestionType.SHORT_TEXT: "short_text",
    QuestionType.BOOLEAN: "boolean",
}


def _choices_from_bank(bank: BankQuestion) -> list[dict]:
    choices = []
    for letter in ("A", "B", "C", "D"):
        text = getattr(bank, f"option_{letter.lower()}") or ""
        if text.strip():
            choices.append({"id": letter, "text": text})
    return choices


def create_question_from_bank(assessment_set, bank_question: BankQuestion, *, order: int | None = None):
    """
    Create a new AssessmentQuestion in ``assessment_set`` sourced from an APPROVED
    bank question. Returns the new AssessmentQuestion (live, not yet snapshotted).

    The content is COPIED (assessments own their editable working copy); the link
    back to (bank_question, bank_version=current_version) records provenance and
    is what the snapshot pins at publish time.
    """
    # Local import avoids any import cycle with assessments.models.
    from assessments.models import AssessmentQuestion

    if bank_question.status != QuestionStatus.APPROVED:
        raise ValidationError(
            f"Question {bank_question.qb_id} is not APPROVED (status={bank_question.status}); "
            "only approved Question Bank questions can be added to an assessment."
        )
    if bank_question.current_version_id is None:
        raise ValidationError(
            f"Question {bank_question.qb_id} has no current version to pin."
        )

    if order is None:
        mx = (
            AssessmentQuestion.objects.filter(assessment_set=assessment_set)
            .aggregate(Max("order")).get("order__max")
            or 0
        )
        order = int(mx) + 1

    return AssessmentQuestion.objects.create(
        assessment_set=assessment_set,
        order=order,
        prompt=bank_question.question_text,
        question_prompt=bank_question.question_prompt or "",
        question_type=_TYPE_MAP.get(bank_question.question_type, "multiple_choice"),
        choices=_choices_from_bank(bank_question),
        correct_answer=bank_question.correct_answer,
        points=bank_question.points or 1,
        explanation=bank_question.explanation or "",
        is_active=True,
        bank_question=bank_question,
        bank_version=bank_question.current_version,
    )


def selectable_bank_questions(*, subject: str | None = None, domain_id=None, skill_id=None,
                              difficulty: str | None = None, search: str | None = None):
    """APPROVED-only queryset for the builder's 'Select From Question Bank' picker."""
    qs = BankQuestion.objects.approved().select_related("domain", "skill")
    if subject:
        qs = qs.filter(subject=subject)
    if domain_id:
        qs = qs.filter(domain_id=domain_id)
    if skill_id:
        qs = qs.filter(skill_id=skill_id)
    if difficulty:
        qs = qs.filter(difficulty=difficulty)
    if search:
        qs = qs.filter(question_text__icontains=search)
    return qs
