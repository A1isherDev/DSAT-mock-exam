from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from users.models import User

class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class Question(TimestampedModel):
    QUESTION_TYPES = [
        ('MATH', 'Math'),
        ('READING', 'Reading'),
        ('WRITING', 'Writing'),
    ]
    question_type = models.CharField(max_length=10, choices=QUESTION_TYPES, db_index=True)
    question_text = models.TextField()
    question_prompt = models.TextField(blank=True, help_text="Secondary text displayed above answer choices.")
    question_image = models.ImageField(upload_to='question_images/', null=True, blank=True)
    option_a = models.TextField(blank=True)
    option_a_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_b = models.TextField(blank=True)
    option_b_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_c = models.TextField(blank=True)
    option_c_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_d = models.TextField(blank=True)
    option_d_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    correct_answers = models.TextField(help_text="For math input, separate multiple correct answers with a comma. e.g. '2/3, 0.666, 0.667'")
    is_math_input = models.BooleanField(default=False)
    score = models.IntegerField(default=10, help_text="Score weight for this question")
    explanation = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0, db_index=True)
    module = models.ForeignKey('Module', on_delete=models.CASCADE, related_name='questions', null=True)
    
    class Meta:
        db_table = 'questions'
        ordering = ['order', 'created_at']
    
    def __str__(self):
        return f"{self.get_question_type_display()} Q{self.id}"

    def get_options(self):
        options = {}
        if self.option_a or self.option_a_image:
            options['A'] = {'text': self.option_a, 'image': self.option_a_image.url if self.option_a_image else None}
        if self.option_b or self.option_b_image:
            options['B'] = {'text': self.option_b, 'image': self.option_b_image.url if self.option_b_image else None}
        if self.option_c or self.option_c_image:
            options['C'] = {'text': self.option_c, 'image': self.option_c_image.url if self.option_c_image else None}
        if self.option_d or self.option_d_image:
            options['D'] = {'text': self.option_d, 'image': self.option_d_image.url if self.option_d_image else None}
        return options if options else None

    def check_answer(self, student_answer):
        if student_answer is None or str(student_answer).strip() == "":
            return False
            
        student_ans_str = str(student_answer).strip().lower()
        
        if self.is_math_input and self.correct_answers:
            valid_answers = [v.strip().lower() for v in self.correct_answers.split(',')]
            return student_ans_str in valid_answers
            
        if self.correct_answers:
            return student_ans_str == self.correct_answers.strip().lower()
            
        return False

class MockExam(TimestampedModel):
    KIND_MOCK_SAT = "MOCK_SAT"
    KIND_MIDTERM = "MIDTERM"
    KIND_CHOICES = [
        (KIND_MOCK_SAT, "Full SAT mock (Reading & Writing + Math)"),
        (KIND_MIDTERM, "Midterm (custom time, 1–2 modules, one subject)"),
    ]

    title = models.CharField(
        max_length=200,
        db_index=True,
        help_text="Timed diagnostic mock (staff-authored). Not built from pastpaper practice items.",
    )
    practice_date = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_published = models.BooleanField(
        default=False,
        db_index=True,
        help_text="When True, students with portal access see this timed mock. Pastpaper practice uses separate standalone tests.",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        default=KIND_MOCK_SAT,
        db_index=True,
    )
    # Used when kind=MIDTERM (teacher/admin-configured)
    midterm_subject = models.CharField(
        max_length=20,
        choices=[("READING_WRITING", "Reading & Writing"), ("MATH", "Math")],
        default="READING_WRITING",
    )
    midterm_module_count = models.PositiveSmallIntegerField(default=2)
    midterm_module1_minutes = models.PositiveIntegerField(default=60)
    midterm_module2_minutes = models.PositiveIntegerField(default=60)
    midterm_target_question_count = models.PositiveIntegerField(
        default=0,
        help_text="0 = no fixed target. Otherwise planner cap for total questions across modules.",
    )
    # Who may open this mock in the app (full SAT / midterm flow). Separate from PracticeTest rows below.
    assigned_users = models.ManyToManyField(
        User,
        related_name="assigned_mock_exams",
        blank=True,
        help_text="Students/teachers who see this mock on the Mock Exam page.",
    )

    class Meta:
        db_table = "mock_exams"

    def __str__(self):
        date_str = self.practice_date.strftime("%B %Y") if self.practice_date else "No Date"
        return f"{date_str} - {self.title}"


class PortalMockExam(TimestampedModel):
    """
    Student Mock Exam page only: separate table from PracticeTest.
    Until a row exists here, the portal mock list is empty. Links to MockExam for /mock/:id engine data.
    """

    mock_exam = models.OneToOneField(
        MockExam,
        on_delete=models.CASCADE,
        related_name="portal_listing",
        help_text="Underlying mock (R&W/Math sections are PracticeTest rows; not exposed on the mock list API).",
    )
    assigned_users = models.ManyToManyField(
        User,
        related_name="assigned_portal_mock_exams",
        blank=True,
        help_text="Who sees this mock on the student Mock Exam page.",
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "portal_mock_exams"

    def __str__(self):
        return f"Portal: {self.mock_exam}"


class PastpaperPack(TimestampedModel):
    """
    Groups standalone pastpaper sections (R&W + Math) for one exam form.
    PracticeTest rows link here when mock_exam is NULL.
    """

    title = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Pack title shown on student practice cards.",
    )
    practice_date = models.DateField(null=True, blank=True, db_index=True)
    label = models.CharField(max_length=10, blank=True, help_text="e.g. A, B — shared by sections in this pack.")
    form_type = models.CharField(
        max_length=20,
        choices=[("INTERNATIONAL", "International Form"), ("US", "US Form")],
        default="INTERNATIONAL",
        db_index=True,
    )

    class Meta:
        db_table = "pastpaper_packs"
        ordering = ["-practice_date", "-created_at"]

    def __str__(self):
        return self.title or f"Pack {self.pk}"


class PracticeTest(TimestampedModel):
    SUBJECT_CHOICES = [
        ('READING_WRITING', 'Reading & Writing'),
        ('MATH', 'Math'),
    ]
    FORM_TYPES = [
        ('INTERNATIONAL', 'International Form'),
        ('US', 'US Form'),
    ]
    mock_exam = models.ForeignKey(
        MockExam,
        on_delete=models.CASCADE,
        related_name="tests",
        null=True,
        blank=True,
        help_text="NULL = pastpaper / practice library. If set, this row is a mock-only section (staff-built under that mock, never linked from pastpapers).",
    )
    pastpaper_pack = models.ForeignKey(
        PastpaperPack,
        on_delete=models.CASCADE,
        related_name="sections",
        null=True,
        blank=True,
        help_text="When set (and mock_exam is NULL), this section belongs to a grouped pastpaper card.",
    )
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES, db_index=True)
    title = models.CharField(
        max_length=255,
        blank=True,
        default="",
        db_index=True,
        help_text="Pastpaper / practice test name (shown in admin and student lists).",
    )
    practice_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional official/exam date shown on student practice cards.",
    )
    label = models.CharField(max_length=10, blank=True, help_text="e.g., A, B, C, D")
    form_type = models.CharField(max_length=20, choices=FORM_TYPES, default='INTERNATIONAL', db_index=True)
    assigned_users = models.ManyToManyField(User, related_name='assigned_tests', blank=True)
    skip_default_modules = models.BooleanField(
        default=False,
        help_text="If True, post_save does not auto-create SAT modules (midterm/custom builds).",
    )
    
    class Meta:
        db_table = 'practice_tests'

    def clean(self):
        super().clean()
        s = getattr(self, "subject", None)
        if s not in ("MATH", "READING_WRITING"):
            from django.core.exceptions import ValidationError

            raise ValidationError(
                {"subject": "PracticeTest.subject must be MATH or READING_WRITING."}
            )

    def __str__(self):
        if self.mock_exam:
            exam_title = self.mock_exam.title
        elif self.pastpaper_pack_id:
            exam_title = self.pastpaper_pack.title or f"Pack {self.pastpaper_pack_id}"
        else:
            exam_title = "Unassigned"
        label_str = f" ({self.label})" if self.label else ""
        return f"{exam_title} - {self.get_subject_display()}{label_str} [{self.get_form_type_display()}]"

from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=PracticeTest)
def create_default_modules(sender, instance, created, **kwargs):
    if not created or instance.skip_default_modules:
        return
    Module.objects.create(
        practice_test=instance,
        module_order=1,
        time_limit_minutes=32 if instance.subject == "READING_WRITING" else 35,
    )
    Module.objects.create(
        practice_test=instance,
        module_order=2,
        time_limit_minutes=32 if instance.subject == "READING_WRITING" else 35,
    )

class Module(TimestampedModel):
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE, related_name='modules')
    MODULE_ORDERS = [(1, 'Module 1'), (2, 'Module 2')]
    module_order = models.IntegerField(choices=MODULE_ORDERS, db_index=True)
    time_limit_minutes = models.IntegerField()
    
    class Meta:
        db_table = 'modules'
        ordering = ['practice_test', 'module_order']

    def __str__(self):
        exam_title = (
            self.practice_test.mock_exam.title
            if self.practice_test and self.practice_test.mock_exam
            else "Unassigned"
        )
        return f"{exam_title} - {self.practice_test.get_subject_display()} - Mod {self.module_order}"


def ensure_full_mock_practice_test_modules(practice_test: PracticeTest) -> None:
    """SAT full mock: guarantee two timed modules per R&W or Math section."""
    if getattr(practice_test, "skip_default_modules", False):
        return
    if practice_test.subject not in ("READING_WRITING", "MATH"):
        return
    existing_orders = set(practice_test.modules.values_list("module_order", flat=True))
    mins = 32 if practice_test.subject == "READING_WRITING" else 35
    for order in (1, 2):
        if order in existing_orders:
            continue
        Module.objects.create(
            practice_test=practice_test,
            module_order=order,
            time_limit_minutes=mins,
        )


class TestAttempt(TimestampedModel):
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='test_attempts')
    
    # Legacy timestamps (kept for backward compatibility with existing clients/admin views).
    started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    
    current_module = models.ForeignKey(Module, on_delete=models.SET_NULL, null=True, blank=True)
    # Legacy (kept): corresponds to whichever module is active.
    current_module_start_time = models.DateTimeField(null=True, blank=True)
    
    completed_modules = models.ManyToManyField(Module, related_name='completed_attempts', blank=True)
    
    module_answers = models.JSONField(default=dict, blank=True)
    flagged_questions = models.JSONField(default=dict, blank=True)
    
    # ── Exam engine state machine (backend-authoritative) ────────────────────
    STATE_NOT_STARTED = "NOT_STARTED"
    STATE_MODULE_1_ACTIVE = "MODULE_1_ACTIVE"
    STATE_MODULE_1_SUBMITTED = "MODULE_1_SUBMITTED"
    STATE_MODULE_2_ACTIVE = "MODULE_2_ACTIVE"
    STATE_MODULE_2_SUBMITTED = "MODULE_2_SUBMITTED"
    STATE_SCORING = "SCORING"
    STATE_COMPLETED = "COMPLETED"
    STATE_CHOICES = [
        (STATE_NOT_STARTED, "Not started"),
        (STATE_MODULE_1_ACTIVE, "Module 1 active"),
        (STATE_MODULE_1_SUBMITTED, "Module 1 submitted"),
        (STATE_MODULE_2_ACTIVE, "Module 2 active"),
        (STATE_MODULE_2_SUBMITTED, "Module 2 submitted"),
        (STATE_SCORING, "Scoring"),
        (STATE_COMPLETED, "Completed"),
    ]
    # NB: kept as a CharField so we can evolve the state machine without DB enum churn.
    current_state = models.CharField(
        max_length=24,
        choices=STATE_CHOICES,
        default=STATE_NOT_STARTED,
        db_index=True,
    )

    # Per-module timestamps (server authoritative for timers/resume)
    module_1_started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    module_1_submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    module_2_started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    module_2_submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    scoring_started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Optimistic concurrency: bumped on every successful state mutation (start/autosave/submit/score).
    version_number = models.PositiveIntegerField(default=0, db_index=True)

    is_completed = models.BooleanField(default=False, db_index=True)
    score = models.IntegerField(null=True, blank=True)
    
    class Meta:
        db_table = 'test_attempts'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.student.email} - {self.practice_test}"

    def _module_by_order(self, order: int) -> Module | None:
        try:
            order = int(order)
        except (TypeError, ValueError):
            return None
        return self.practice_test.modules.filter(module_order=order).order_by("id").first()

    def _set_active_module(self, module: Module) -> None:
        self.current_module = module
        now = timezone.now()
        self.current_module_start_time = now
        # Mirror into engine timestamps.
        if module.module_order == 1:
            self.module_1_started_at = self.module_1_started_at or now
        elif module.module_order == 2:
            self.module_2_started_at = self.module_2_started_at or now

    def start_module(self, module: Module) -> None:
        """
        Enforced module sequencing for timed mock attempts.
        - Cannot start Module 2 before Module 1 is submitted.
        - Cannot start any module once COMPLETED.
        - Starting Module 1 from NOT_STARTED transitions to MODULE_1_ACTIVE.
        - Starting Module 2 after Module 1 transitions to MODULE_2_ACTIVE.
        """
        if self.is_completed or self.current_state == self.STATE_COMPLETED:
            raise ValidationError("Cannot start module for a completed test")
        if not module or module.practice_test_id != self.practice_test_id:
            raise ValidationError("Invalid module for this attempt")

        if not self.started_at:
            self.started_at = timezone.now()

        if module.module_order == 1:
            if self.current_state not in (self.STATE_NOT_STARTED, self.STATE_MODULE_1_ACTIVE):
                raise ValidationError(f"Cannot (re)start module 1 from state {self.current_state}")
            self.current_state = self.STATE_MODULE_1_ACTIVE
            self._set_active_module(module)
            self.version_number = int(self.version_number or 0) + 1
            self.save(
                update_fields=[
                    "started_at",
                    "current_state",
                    "current_module",
                    "current_module_start_time",
                    "module_1_started_at",
                    "version_number",
                    "updated_at",
                ]
            )
            return

        if module.module_order == 2:
            if self.current_state not in (self.STATE_MODULE_1_SUBMITTED, self.STATE_MODULE_2_ACTIVE):
                raise ValidationError("Cannot start module 2 before module 1 submission")
            self.current_state = self.STATE_MODULE_2_ACTIVE
            self._set_active_module(module)
            self.version_number = int(self.version_number or 0) + 1
            self.save(
                update_fields=[
                    "started_at",
                    "current_state",
                    "current_module",
                    "current_module_start_time",
                    "module_2_started_at",
                    "version_number",
                    "updated_at",
                ]
            )
            return

        raise ValidationError("Invalid module order")

    def submit_module(self, module_answers: dict, flagged: list = None) -> None:
        old_state = self.current_state
        old_mod_id = self.current_module_id
        old_v = self.version_number
        
        logger.info(
            "[FORENSIC] submit_module_start attempt_id=%s current_state=%s current_mod_id=%s v=%s",
            self.id, old_state, old_mod_id, old_v
        )

        if not self.current_module:
            logger.error("[FORENSIC] submit_module_fail_no_module attempt_id=%s", self.id)
            raise ValidationError("No current module to submit")

        if self.is_completed or self.current_state == self.STATE_COMPLETED:
            logger.warning("[FORENSIC] submit_module_fail_already_completed attempt_id=%s", self.id)
            raise ValidationError("Attempt already completed")

        # Capture current module info before we do anything
        current_mod = self.current_module
        mod_order = int(getattr(current_mod, "module_order", 0) or 0)
        mod_id = current_mod.id

        # Defensive: If this specific module is already completed, do not re-process.
        # This is a critical safety check for retries.
        if self.completed_modules.filter(pk=mod_id).exists():
            logger.warning("[FORENSIC] submit_module_skip_already_submitted attempt_id=%s mod_id=%s order=%s", self.id, mod_id, mod_order)
            return

        if not self.module_answers:
            self.module_answers = {}
        if not self.flagged_questions:
            self.flagged_questions = {}

        self.module_answers[str(mod_id)] = module_answers
        self.flagged_questions[str(mod_id)] = flagged or []
        
        # Mark as completed in the set
        self.completed_modules.add(current_mod)

        if mod_order == 1:
            # After Module 1 submission, strictly move to Module 2.
            now = timezone.now()
            self.module_1_submitted_at = self.module_1_submitted_at or now
            self.current_state = self.STATE_MODULE_2_ACTIVE
            next_module = self._module_by_order(2)
            
            if next_module is None:
                logger.error("[FORENSIC] submit_module_m2_missing attempt_id=%s", self.id)
                # Fallback: if M2 is missing, we can't stay in M1_ACTIVE.
                # We'll set current_module to None to force a failure/sync on frontend.
                self.current_module = None
                self.version_number = int(self.version_number or 0) + 1
                self.save(update_fields=["module_answers", "flagged_questions", "current_state", "module_1_submitted_at", "current_module", "version_number", "updated_at"])
                raise ValidationError("Module 2 is missing; cannot advance exam.")
            
            logger.info("[FORENSIC] submit_module_transitioning_m1_to_m2 attempt_id=%s m1_id=%s m2_id=%s", self.id, mod_id, next_module.id)
            self._set_active_module(next_module)
            self.version_number = int(self.version_number or 0) + 1
            self.save(
                update_fields=[
                    "module_answers",
                    "flagged_questions",
                    "current_state",
                    "module_1_submitted_at",
                    "current_module",
                    "current_module_start_time",
                    "module_2_started_at",
                    "version_number",
                    "updated_at",
                ]
            )
            logger.info(
                "[FORENSIC] submit_module_m1_committed attempt_id=%s new_state=%s new_mod_id=%s new_v=%s",
                self.id, self.current_state, self.current_module_id, self.version_number
            )
            return

        if mod_order == 2:
            logger.info("[FORENSIC] submit_module_m2_finishing attempt_id=%s m2_id=%s", self.id, mod_id)
            now = timezone.now()
            self.module_2_submitted_at = self.module_2_submitted_at or now
            self.current_state = self.STATE_MODULE_2_SUBMITTED
            self.version_number = int(self.version_number or 0) + 1
            self.save(
                update_fields=[
                    "module_answers",
                    "flagged_questions",
                    "current_state",
                    "module_2_submitted_at",
                    "version_number",
                    "updated_at",
                ]
            )
            logger.info("[FORENSIC] submit_module_m2_committed attempt_id=%s new_state=%s v=%s", self.id, self.current_state, self.version_number)
            return

        logger.error("[FORENSIC] submit_module_fail_invalid_order attempt_id=%s mod_id=%s order=%s", self.id, mod_id, mod_order)
        raise ValidationError(f"Invalid module order {mod_order}")


        raise ValidationError("Invalid current module order")

    def enter_scoring(self):
        """
        Transition MODULE_2_SUBMITTED → SCORING (async worker will complete).
        """
        if self.is_completed or self.current_state == self.STATE_COMPLETED:
            return
        if self.current_state != self.STATE_MODULE_2_SUBMITTED:
            raise ValidationError(f"Cannot enter scoring from state {self.current_state}")
        now = timezone.now()
        self.scoring_started_at = self.scoring_started_at or now
        self.current_state = self.STATE_SCORING
        self.version_number = int(self.version_number or 0) + 1
        self.save(update_fields=["current_state", "scoring_started_at", "version_number", "updated_at"])

    def complete_test(self):
        if self.is_completed:
            return
            
        now = timezone.now()
        self.submitted_at = self.submitted_at or now
        self.is_completed = True
        self.current_state = self.STATE_COMPLETED
        self.completed_at = self.completed_at or now
        self.version_number = int(self.version_number or 0) + 1

        pt = self.practice_test
        mock = getattr(pt, "mock_exam", None)
        if mock is None and pt.mock_exam_id:
            mock = MockExam.objects.filter(pk=pt.mock_exam_id).first()
        if mock and mock.kind == MockExam.KIND_MIDTERM:
            total_earned = 0
            for module_id_str, answers in self.module_answers.items():
                try:
                    module = Module.objects.prefetch_related("questions").get(id=int(module_id_str))
                except (ValueError, Module.DoesNotExist):
                    continue
                for question in module.questions.all():
                    ans = answers.get(str(question.id))
                    if question.check_answer(ans):
                        total_earned += question.score
            self.score = min(total_earned, 100)
            self.current_module = None
            self.save(
                update_fields=[
                    "submitted_at",
                    "is_completed",
                    "current_state",
                    "completed_at",
                    "version_number",
                    "score",
                    "current_module",
                    "updated_at",
                ]
            )
            return
        
        # SAT Scoring Rules:
        # English (READING_WRITING): M1 base 200, max 530 (gap 330); M2 max 270. Total 800.
        # Math:                   M1 base 200, max 580 (gap 380); M2 max 220. Total 800.
        
        subject = self.practice_test.subject
        m1_earned = 0
        m2_earned = 0
        
        for module_id_str, answers in self.module_answers.items():
            try:
                module = Module.objects.prefetch_related('questions').get(id=int(module_id_str))
                module_earned = 0
                for question in module.questions.all():
                    ans = answers.get(str(question.id))
                    if question.check_answer(ans):
                        module_earned += question.score
                
                # Apply limits per module/subject
                if subject == 'READING_WRITING':
                    if module.module_order == 1:
                        m1_earned = min(module_earned, 330) # 530 - 200
                    else:
                        m2_earned = min(module_earned, 270)
                elif subject == 'MATH':
                    if module.module_order == 1:
                        m1_earned = min(module_earned, 380) # 580 - 200
                    else:
                        m2_earned = min(module_earned, 220)
            except Exception:
                pass
                
        # Final Score = Base (200) + M1 earned + M2 earned
        self.score = min(200 + m1_earned + m2_earned, 800)
        self.current_module = None
        self.save(
            update_fields=[
                "submitted_at",
                "is_completed",
                "current_state",
                "completed_at",
                "version_number",
                "score",
                "current_module",
                "updated_at",
            ]
        )

    def get_module_results(self):
        """Returns detailed results broken down by module for the review page."""
        results = []
        subject = self.practice_test.subject
        pt = self.practice_test
        mock = getattr(pt, "mock_exam", None)
        if mock is None and pt.mock_exam_id:
            mock = MockExam.objects.filter(pk=pt.mock_exam_id).first()
        is_midterm = bool(mock and mock.kind == MockExam.KIND_MIDTERM)
        
        # Prefetch questions for all modules in this test
        modules = self.practice_test.modules.prefetch_related('questions').order_by('module_order')
        
        for module in modules:
            module_answers = self.module_answers.get(str(module.id), {})
            questions_data = []
            module_earned = 0
            
            for question in module.questions.all():
                student_ans = module_answers.get(str(question.id))
                is_correct = question.check_answer(student_ans)
                if is_correct:
                    module_earned += question.score
                
                questions_data.append({
                    'id': question.id,
                    'is_correct': is_correct,
                    'student_answer': student_ans,
                    'correct_answers': question.correct_answers,
                    'score': question.score,
                    'text': question.question_text,
                    'question_prompt': question.question_prompt,
                    'image': question.question_image.url if question.question_image else None,
                    'type': question.get_question_type_display(),
                    'options': question.get_options(),
                    'is_math_input': question.is_math_input
                })
            
            # Apply caps exactly like in complete_test (midterm: raw sum, max 100 at attempt level)
            capped_earned = module_earned
            if is_midterm:
                capped_earned = module_earned
            elif subject == 'READING_WRITING':
                if module.module_order == 1: capped_earned = min(module_earned, 330)
                else: capped_earned = min(module_earned, 270)
            elif subject == 'MATH':
                if module.module_order == 1: capped_earned = min(module_earned, 380)
                else: capped_earned = min(module_earned, 220)
                
            results.append({
                'module_id': module.id,
                'module_order': module.module_order,
                'module_earned': module_earned,
                'capped_earned': capped_earned,
                'questions': questions_data
            })
            
        return results

class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100)
    details = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.action} at {self.timestamp}"


class BulkAssignmentDispatch(models.Model):
    """
    Audit trail for ``/api/exams/bulk_assign/`` library dispatches (pastpaper sections + timed mocks).

    ``payload`` stores the exact request body subset for ``rerun``; ``result`` stores structured outcome.
    """

    KIND_PASTPAPER = "pastpaper"
    KIND_TIMED_MOCK = "timed_mock"
    KIND_MIXED = "mixed"
    KIND_CHOICES = [
        (KIND_PASTPAPER, "Pastpaper library"),
        (KIND_TIMED_MOCK, "Timed mock"),
        (KIND_MIXED, "Mixed"),
    ]

    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_DELIVERED = "delivered"  # kept for legacy rows; new code uses COMPLETED/FAILED
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_DELIVERED, "Delivered"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bulk_library_dispatches",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, db_index=True)
    subject_summary = models.CharField(max_length=200, blank=True, default="")
    students_requested_count = models.PositiveIntegerField(default=0)
    students_granted_count = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    actor_snapshot = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=64, blank=True, db_index=True)
    idempotency_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    rerun_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reruns",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "exams_bulk_assignment_dispatch"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"BulkDispatch#{self.pk} {self.kind} by {self.assigned_by_id}"


class AttemptIdempotencyKey(models.Model):
    """
    Stores responses for idempotent attempt mutations (submit/autosave/start).
    """

    attempt = models.ForeignKey(TestAttempt, on_delete=models.CASCADE, related_name="idempotency_keys")
    endpoint = models.CharField(max_length=64, db_index=True)
    key = models.CharField(max_length=128, db_index=True)
    response_status = models.PositiveSmallIntegerField(default=200)
    response_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "exams_attempt_idempotency_keys"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "endpoint", "key"], name="uniq_attempt_endpoint_key"),
        ]
