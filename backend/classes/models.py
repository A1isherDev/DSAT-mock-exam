from __future__ import annotations

import secrets
import string

from django.conf import settings
from django.db import models
from django.utils import timezone

from exams.models import MockExam, PastpaperPack, PracticeTest, Module, TestAttempt


def _generate_join_code(length: int = 7) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Classroom(models.Model):
    SUBJECT_ENGLISH = "ENGLISH"
    SUBJECT_MATH = "MATH"
    SUBJECT_CHOICES = [
        (SUBJECT_ENGLISH, "English"),
        (SUBJECT_MATH, "Math"),
    ]

    DAYS_ODD = "ODD"
    DAYS_EVEN = "EVEN"
    DAYS_CHOICES = [
        (DAYS_ODD, "Odd days"),
        (DAYS_EVEN, "Even days"),
    ]

    name = models.CharField(max_length=120, db_index=True)
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES, db_index=True)
    lesson_days = models.CharField(max_length=10, choices=DAYS_CHOICES, db_index=True)
    lesson_time = models.CharField(max_length=40, help_text="Example: 18:00", blank=True)
    lesson_hours = models.PositiveIntegerField(default=2, help_text="Lesson duration in hours")
    start_date = models.DateField(null=True, blank=True)
    room_number = models.CharField(max_length=30, blank=True)
    telegram_chat_id = models.CharField(max_length=100, blank=True)
    max_students = models.PositiveIntegerField(null=True, blank=True)
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teaching_classes",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_classes"
    )
    join_code = models.CharField(max_length=12, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "classrooms"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name

    def ensure_join_code(self) -> None:
        if self.join_code:
            return
        while True:
            code = _generate_join_code()
            if not Classroom.objects.filter(join_code=code).exists():
                self.join_code = code
                return

    def save(self, *args, **kwargs):
        self.ensure_join_code()
        return super().save(*args, **kwargs)


class ClassroomMembership(models.Model):
    ROLE_ADMIN = "ADMIN"
    ROLE_STUDENT = "STUDENT"
    ROLE_CHOICES = [
        (ROLE_ADMIN, "Admin"),
        (ROLE_STUDENT, "Student"),
    ]

    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="class_memberships"
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, db_index=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "classroom_memberships"
        unique_together = [("classroom", "user")]
        ordering = ["role", "-joined_at"]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.classroom_id} ({self.role})"


class ClassPost(models.Model):
    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name="posts"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="class_posts"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "class_posts"
        ordering = ["-created_at"]


class Assignment(models.Model):
    PRACTICE_SCOPE_BOTH = "BOTH"
    PRACTICE_SCOPE_ENGLISH = "ENGLISH"
    PRACTICE_SCOPE_MATH = "MATH"
    PRACTICE_SCOPE_CHOICES = [
        (PRACTICE_SCOPE_BOTH, "Both (English & Math)"),
        (PRACTICE_SCOPE_ENGLISH, "English (Reading & Writing) only"),
        (PRACTICE_SCOPE_MATH, "Math only"),
    ]

    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name="assignments"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_assignments"
    )
    title = models.CharField(max_length=200, db_index=True)
    instructions = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Attachments (MVP)
    mock_exam = models.ForeignKey(
        MockExam, on_delete=models.SET_NULL, null=True, blank=True, related_name="class_assignments"
    )
    practice_test = models.ForeignKey(
        PracticeTest, on_delete=models.SET_NULL, null=True, blank=True, related_name="class_assignments"
    )
    pastpaper_pack = models.ForeignKey(
        PastpaperPack,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="class_assignments",
    )
    practice_test_ids = models.JSONField(null=True, blank=True)
    module = models.ForeignKey(
        Module, on_delete=models.SET_NULL, null=True, blank=True, related_name="class_assignments"
    )
    external_url = models.URLField(blank=True)
    attachment_file = models.FileField(upload_to="homework_files/", null=True, blank=True)
    practice_scope = models.CharField(
        max_length=20,
        choices=PRACTICE_SCOPE_CHOICES,
        default=PRACTICE_SCOPE_BOTH,
        help_text="For mock or pastpaper with multiple sections: assign all, English only, or Math only.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "class_assignments"
        ordering = ["-created_at"]


class AssignmentExtraAttachment(models.Model):
    """Additional homework files beyond the primary ``Assignment.attachment_file``."""

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="extra_attachments"
    )
    file = models.FileField(upload_to="homework_files/")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "class_assignment_extra_attachments"
        ordering = ["id"]


def raw_target_practice_test_ids_from_fks(
    mock_exam_id: int | None,
    pastpaper_pack_id: int | None,
    practice_test_ids: list | None,
    practice_test_id: int | None,
) -> list[int]:
    """
    Practice test row ids before practice_scope filtering (mock, pack, legacy bundle, or single).
    """
    if mock_exam_id:
        order = {"READING_WRITING": 0, "MATH": 1}
        rows = list(
            PracticeTest.objects.filter(mock_exam_id=mock_exam_id).values_list("id", "subject")
        )
        rows.sort(key=lambda r: (order.get(r[1], 9), r[0]))
        return [r[0] for r in rows]
    if pastpaper_pack_id:
        order = {"READING_WRITING": 0, "MATH": 1}
        rows = list(
            PracticeTest.objects.filter(pastpaper_pack_id=pastpaper_pack_id).values_list(
                "id", "subject"
            )
        )
        rows.sort(key=lambda r: (order.get(r[1], 9), r[0]))
        return [r[0] for r in rows]
    if practice_test_ids:
        out: list[int] = []
        for x in practice_test_ids:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out
    if practice_test_id:
        return [practice_test_id]
    return []


def filter_practice_targets_by_scope(raw_ids: list[int], scope: str) -> list[int]:
    """Keep only Reading & Writing or Math rows when scope is not BOTH."""
    if not raw_ids or scope == Assignment.PRACTICE_SCOPE_BOTH:
        return raw_ids
    subs = dict(PracticeTest.objects.filter(id__in=raw_ids).values_list("id", "subject"))
    out: list[int] = []
    for pk in raw_ids:
        subj = subs.get(pk)
        if subj is None:
            continue
        if scope == Assignment.PRACTICE_SCOPE_ENGLISH and subj == "READING_WRITING":
            out.append(pk)
        elif scope == Assignment.PRACTICE_SCOPE_MATH and subj == "MATH":
            out.append(pk)
    return out


def assignment_target_practice_test_ids(assignment: Assignment) -> list[int]:
    """Practice test ids linked to this homework, after applying practice_scope."""
    raw = raw_target_practice_test_ids_from_fks(
        assignment.mock_exam_id,
        assignment.pastpaper_pack_id,
        assignment.practice_test_ids,
        assignment.practice_test_id,
    )
    scope = assignment.practice_scope or Assignment.PRACTICE_SCOPE_BOTH
    return filter_practice_targets_by_scope(raw, scope)


class Submission(models.Model):
    STATUS_DRAFT = "DRAFT"
    STATUS_SUBMITTED = "SUBMITTED"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_SUBMITTED, "Submitted"),
    ]

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="submissions"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignment_submissions"
    )
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    text_response = models.TextField(blank=True)
    upload_file = models.FileField(upload_to="homework_submissions/", null=True, blank=True)

    # Optional link to an attempt in the existing exam system
    attempt = models.ForeignKey(
        TestAttempt, on_delete=models.SET_NULL, null=True, blank=True, related_name="class_submissions"
    )

    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "class_submissions"
        unique_together = [("assignment", "student")]
        ordering = ["-submitted_at", "-updated_at"]

    def mark_submitted(self):
        self.status = self.STATUS_SUBMITTED
        self.submitted_at = timezone.now()


class Grade(models.Model):
    submission = models.OneToOneField(
        Submission, on_delete=models.CASCADE, related_name="grade"
    )
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="given_grades"
    )
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(blank=True)
    graded_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "class_grades"

