"""
When a student finishes all practice-test sections required by class homework, upsert the
submission as SUBMITTED with a linked TestAttempt — no separate file upload.

Also used when loading ``my-submission`` so late joins / missed signals still sync.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from exams.models import TestAttempt

from .models import (
    Assignment,
    ClassroomMembership,
    Submission,
    SubmissionAuditEvent,
    assignment_target_practice_test_ids,
)
from .submission_audit import audit_submission_event

logger = logging.getLogger("classes.homework_auto_submit")


def _latest_completed_attempt(student_id: int, practice_test_id: int) -> TestAttempt | None:
    return (
        TestAttempt.objects.filter(
            student_id=student_id,
            practice_test_id=practice_test_id,
            is_completed=True,
        )
        .order_by("-submitted_at", "-id")
        .first()
    )


def _collect_completed_attempts_for_targets(
    student_id: int, targets: list[int]
) -> list[TestAttempt] | None:
    out: list[TestAttempt] = []
    for pt_id in targets:
        ta = _latest_completed_attempt(student_id, pt_id)
        if not ta:
            return None
        out.append(ta)
    return out


def _representative_attempt(attempts: list[TestAttempt]) -> TestAttempt:
    return max(attempts, key=lambda a: (a.submitted_at or timezone.now(), a.pk))


def _apply_sync(student, assignment: Assignment, best: TestAttempt) -> bool:
    """
    Update submission to link ``best`` and SUBMITTED when appropriate.
    Returns True if the row changed.
    """
    from django.db import IntegrityError

    with transaction.atomic():
        row = (
            Submission.objects.select_for_update()
            .filter(assignment=assignment, student=student)
            .first()
        )
        if row is None:
            try:
                row = Submission.objects.create(assignment=assignment, student=student)
            except IntegrityError:
                row = Submission.objects.select_for_update().get(
                    assignment=assignment, student=student
                )

        s = Submission.objects.select_for_update().get(pk=row.pk)

        if s.status == Submission.STATUS_REVIEWED:
            return False

        prev_status = s.status
        prev_attempt_id = s.attempt_id
        attempt_changed = prev_attempt_id != best.id

        if prev_status == Submission.STATUS_SUBMITTED:
            if not attempt_changed:
                return False
            s.revision += 1
            rev = s.revision
            audit_submission_event(
                s.pk,
                None,
                SubmissionAuditEvent.EVENT_ATTEMPT_CHANGE,
                {
                    "from_attempt_id": prev_attempt_id,
                    "to_attempt_id": best.id,
                    "source": "practice_targets_complete",
                },
                submission_revision=rev,
            )
            s.attempt = best
            s.save()
            return True

        if prev_status not in (
            Submission.STATUS_DRAFT,
            Submission.STATUS_RETURNED,
        ):
            return False

        s.revision += 1
        rev = s.revision
        if attempt_changed:
            audit_submission_event(
                s.pk,
                None,
                SubmissionAuditEvent.EVENT_ATTEMPT_CHANGE,
                {
                    "from_attempt_id": prev_attempt_id,
                    "to_attempt_id": best.id,
                    "source": "practice_targets_complete",
                },
                submission_revision=rev,
            )
        s.attempt = best
        prev_for_status = s.status
        s.mark_submitted()
        audit_submission_event(
            s.pk,
            None,
            SubmissionAuditEvent.EVENT_STATUS_CHANGE,
            {
                "from": prev_for_status,
                "to": s.status,
                "source": "practice_targets_complete",
            },
            submission_revision=rev,
        )
        s.save()
        return True


def sync_practice_submission_for_assignment(student, assignment: Assignment) -> bool:
    """
    If every practice-test target for ``assignment`` has a completed attempt for ``student``,
    ensure the class submission is SUBMITTED with a linked attempt.
    """
    targets = assignment_target_practice_test_ids(assignment)
    if not targets:
        return False
    attempts = _collect_completed_attempts_for_targets(student.pk, targets)
    if not attempts:
        return False
    best = _representative_attempt(attempts)
    try:
        return _apply_sync(student, assignment, best)
    except Exception:
        logger.exception(
            "sync_practice_submission_failed assignment_id=%s student_id=%s",
            assignment.pk,
            getattr(student, "pk", student),
        )
        raise


def sync_homework_after_test_attempt_saved(attempt: TestAttempt) -> None:
    """Called from post_save when ``is_completed`` is True."""
    if not attempt.is_completed:
        return
    student_id = attempt.student_id
    class_ids = ClassroomMembership.objects.filter(
        user_id=student_id, role=ClassroomMembership.ROLE_STUDENT
    ).values_list("classroom_id", flat=True)
    if not class_ids:
        return

    from django.contrib.auth import get_user_model

    User = get_user_model()
    student = User.objects.filter(pk=student_id).first()
    if not student:
        return

    for assignment in Assignment.objects.filter(classroom_id__in=class_ids).iterator():
        targets = assignment_target_practice_test_ids(assignment)
        if not targets or attempt.practice_test_id not in targets:
            continue
        try:
            sync_practice_submission_for_assignment(student, assignment)
        except Exception:
            logger.exception(
                "sync_homework_after_attempt assignment_id=%s attempt_id=%s",
                assignment.pk,
                attempt.pk,
            )
