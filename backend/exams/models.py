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
    option_a = models.CharField(max_length=255, blank=True)
    option_a_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_b = models.CharField(max_length=255, blank=True)
    option_b_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_c = models.CharField(max_length=255, blank=True)
    option_c_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    option_d = models.CharField(max_length=255, blank=True)
    option_d_image = models.ImageField(upload_to='option_images/', null=True, blank=True)
    correct_answers = models.CharField(max_length=255, help_text="For math input, separate multiple correct answers with a comma. e.g. '2/3, 0.666, 0.667'")
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
    title = models.CharField(max_length=200, db_index=True, help_text="e.g., International Form C")
    practice_date = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    # assigned_users moved to PracticeTest to allow granular assignments
    
    class Meta:
        db_table = 'mock_exams'

    def __str__(self):
        date_str = self.practice_date.strftime('%B %Y') if self.practice_date else "No Date"
        return f"{date_str} - {self.title}"

class PracticeTest(TimestampedModel):
    SUBJECT_CHOICES = [
        ('READING_WRITING', 'Reading & Writing'),
        ('MATH', 'Math'),
    ]
    FORM_TYPES = [
        ('INTERNATIONAL', 'International Form'),
        ('US', 'US Form'),
    ]
    mock_exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='tests', null=True, blank=True)
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES, db_index=True)
    label = models.CharField(max_length=10, blank=True, help_text="e.g., A, B, C, D")
    form_type = models.CharField(max_length=20, choices=FORM_TYPES, default='INTERNATIONAL', db_index=True)
    assigned_users = models.ManyToManyField(User, related_name='assigned_tests', blank=True)
    
    class Meta:
        db_table = 'practice_tests'

    def __str__(self):
        exam_title = self.mock_exam.title if self.mock_exam else "Unassigned"
        label_str = f" ({self.label})" if self.label else ""
        return f"{exam_title} - {self.get_subject_display()}{label_str} [{self.get_form_type_display()}]"

from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=PracticeTest)
def create_default_modules(sender, instance, created, **kwargs):
    if created:
        Module.objects.create(practice_test=instance, module_order=1, time_limit_minutes=32 if instance.subject == 'READING_WRITING' else 35)
        Module.objects.create(practice_test=instance, module_order=2, time_limit_minutes=32 if instance.subject == 'READING_WRITING' else 35)

class Module(TimestampedModel):
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE, related_name='modules')
    MODULE_ORDERS = [(1, 'Module 1'), (2, 'Module 2')]
    module_order = models.IntegerField(choices=MODULE_ORDERS, db_index=True)
    time_limit_minutes = models.IntegerField()
    
    class Meta:
        db_table = 'modules'
        ordering = ['practice_test', 'module_order']

    def __str__(self):
        return f"{self.practice_test.title} - Mod {self.module_order}"

class TestAttempt(TimestampedModel):
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='test_attempts')
    
    started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    
    current_module = models.ForeignKey(Module, on_delete=models.SET_NULL, null=True, blank=True)
    current_module_start_time = models.DateTimeField(null=True, blank=True)
    
    completed_modules = models.ManyToManyField(Module, related_name='completed_attempts', blank=True)
    
    module_answers = models.JSONField(default=dict, blank=True)
    flagged_questions = models.JSONField(default=dict, blank=True)
    
    is_completed = models.BooleanField(default=False, db_index=True)
    score = models.IntegerField(null=True, blank=True)
    
    class Meta:
        db_table = 'test_attempts'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.student.email} - {self.practice_test}"

    def start_test(self):
        if self.started_at:
            raise ValidationError("Section already started")
            
        self.started_at = timezone.now()
        first_module = self.practice_test.modules.filter(module_order=1).first()
        if first_module:
            self.current_module = first_module
            self.current_module_start_time = timezone.now()
        self.save()

    def submit_module(self, module_answers, flagged_questions=[]):
        if not self.current_module:
            raise ValidationError("No current module to submit")
            
        module_id = str(self.current_module.id)
        self.module_answers[module_id] = module_answers
        self.flagged_questions[module_id] = flagged_questions
        
        # Mark as completed in the set
        self.completed_modules.add(self.current_module)
        
        # If this was module 2, or no module 2 exists, we might still want to mark test as completed
        # but the user said "their choice". For now, we just clear current_module
        # and let the user decide what to do next.
        
        # Check if all modules of this test are now in completed_modules
        total_modules = self.practice_test.modules.count()
        if self.completed_modules.count() >= total_modules:
            self.complete_test()
        else:
            # Advance to next module automatically
            next_module = self.practice_test.modules.exclude(id__in=self.completed_modules.all()).order_by('module_order').first()
            if next_module:
                self.current_module = next_module
                self.current_module_start_time = timezone.now()
                self.save()

    def complete_test(self):
        if self.is_completed:
            return
            
        self.submitted_at = timezone.now()
        self.is_completed = True
        
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
        self.save()

    def get_module_results(self):
        """Returns detailed results broken down by module for the review page."""
        results = []
        subject = self.practice_test.subject
        
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
            
            # Apply caps exactly like in complete_test
            capped_earned = module_earned
            if subject == 'READING_WRITING':
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
