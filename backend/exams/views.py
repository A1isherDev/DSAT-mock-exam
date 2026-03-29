from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Prefetch

from access import constants as acc_const
from access.permissions import RequiresSubmitTest
from access.policies import (
    BulkAssignAccess,
    MockExamAdminAccess,
    ModuleNestedAdminAccess,
    PracticeTestAdminAccess,
    QuestionNestedAdminAccess,
)
from access.services import (
    authorize,
    filter_mock_exams_for_user,
    filter_practice_tests_for_user,
    get_effective_permission_codenames,
)

from .models import PracticeTest, TestAttempt, Module, Question, AuditLog, MockExam
from .serializers import (
    MockExamSerializer,
    PracticeTestSerializer,
    TestAttemptSerializer,
    ModuleSerializer,
    AdminMockExamSerializer,
    AdminPracticeTestSerializer,
    AdminModuleSerializer,
    AdminQuestionSerializer,
)


class MockExamViewSet(viewsets.ReadOnlyModelViewSet):
    """Student-facing endpoint to list their assigned mock exams."""
    permission_classes = [IsAuthenticated]
    serializer_class = MockExamSerializer

    def get_queryset(self):
        user = self.request.user
        perms = get_effective_permission_codenames(user)
        base = MockExam.objects.filter(is_active=True)
        if acc_const.WILDCARD in perms or acc_const.PERM_VIEW_ALL_TESTS in perms:
            return base.prefetch_related("tests__modules")
        if {
            acc_const.PERM_VIEW_ENGLISH_TESTS,
            acc_const.PERM_VIEW_MATH_TESTS,
            acc_const.PERM_CREATE_TEST,
            acc_const.PERM_EDIT_TEST,
            acc_const.PERM_DELETE_TEST,
            acc_const.PERM_ASSIGN_TEST_ACCESS,
        } & perms:
            return filter_mock_exams_for_user(user, base).prefetch_related("tests__modules")

        assigned_tests = PracticeTest.objects.filter(assigned_users=user)
        return (
            MockExam.objects.filter(is_active=True, tests__assigned_users=user)
            .prefetch_related(Prefetch("tests", queryset=assigned_tests.prefetch_related("modules")))
            .distinct()
        )


class PracticeTestViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PracticeTestSerializer

    def get_queryset(self):
        user = self.request.user
        perms = get_effective_permission_codenames(user)
        base = PracticeTest.objects.all().prefetch_related("modules")
        if acc_const.WILDCARD in perms or acc_const.PERM_VIEW_ALL_TESTS in perms:
            return base
        if {
            acc_const.PERM_VIEW_ENGLISH_TESTS,
            acc_const.PERM_VIEW_MATH_TESTS,
            acc_const.PERM_CREATE_TEST,
            acc_const.PERM_EDIT_TEST,
            acc_const.PERM_DELETE_TEST,
            acc_const.PERM_ASSIGN_TEST_ACCESS,
        } & perms:
            return filter_practice_tests_for_user(user, base)
        return PracticeTest.objects.filter(assigned_users=user, mock_exam__is_active=True).prefetch_related(
            "modules"
        )

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, BulkAssignAccess])
    def bulk_assign(self, request):
        exam_ids = request.data.get("exam_ids", [])
        user_ids = request.data.get("user_ids", [])
        assignment_type = request.data.get("assignment_type", "FULL")
        form_type = request.data.get("form_type")

        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = list(User.objects.filter(id__in=user_ids))

        subject_map = {
            "MATH": (["MATH"], ["READING_WRITING"]),
            "ENGLISH": (["READING_WRITING"], ["MATH"]),
            "FULL": (["MATH", "READING_WRITING"], []),
        }
        to_add_subjects, to_remove_subjects = subject_map.get(
            assignment_type, (["MATH", "READING_WRITING"], [])
        )

        add_filters = {"mock_exam_id__in": exam_ids, "subject__in": to_add_subjects}
        if form_type:
            add_filters["form_type"] = form_type

        add_tests = PracticeTest.objects.filter(**add_filters)
        added_count = 0
        for pt in add_tests:
            if authorize(request.user, acc_const.PERM_ASSIGN_TEST_ACCESS, subject=pt.subject):
                pt.assigned_users.add(*users)
                added_count += 1

        removed_count = 0
        if to_remove_subjects:
            remove_filters = {"mock_exam_id__in": exam_ids, "subject__in": to_remove_subjects}
            if form_type:
                remove_filters["form_type"] = form_type
            remove_tests = PracticeTest.objects.filter(**remove_filters)
            for pt in remove_tests:
                if authorize(request.user, acc_const.PERM_ASSIGN_TEST_ACCESS, subject=pt.subject):
                    pt.assigned_users.remove(*users)
                    removed_count += 1

        return Response(
            {
                "status": "bulk_assigned",
                "exams_count": len(exam_ids),
                "tests_added": added_count,
                "tests_removed": removed_count,
                "users_count": len(users),
                "type": assignment_type,
            }
        )

class TestAttemptViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, RequiresSubmitTest]
    serializer_class = TestAttemptSerializer
    throttle_scope = "burst"

    def get_queryset(self):
        return TestAttempt.objects.filter(student=self.request.user)

    def create(self, request, *args, **kwargs):
        test_id = request.data.get("practice_test")
        test = get_object_or_404(PracticeTest, id=test_id)
        
        # Get or create attempt (only reuse INCOMPLETE attempts)
        attempt = TestAttempt.objects.filter(
            student=request.user,
            practice_test=test,
            is_completed=False
        ).first()

        if not attempt:
            attempt = TestAttempt.objects.create(
                student=request.user,
                practice_test=test
            )
        
        AuditLog.objects.create(
            user=request.user,
            action="START_TEST",
            details=f"Started practice test: {test}"
        )
            
        serializer = self.get_serializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def start_module(self, request, pk=None):
        attempt = self.get_object()
        module_id = request.data.get('module_id')
        
        module = get_object_or_404(Module, id=module_id, practice_test=attempt.practice_test)
        
        if attempt.is_completed:
            return Response({'error': 'Cannot start module for a completed test'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not attempt.started_at:
            attempt.started_at = timezone.now()
            
        attempt.current_module = module
        attempt.current_module_start_time = timezone.now()
        attempt.save()
        
        AuditLog.objects.create(
            user=request.user,
            action="START_MODULE",
            details=f"Started module {module.module_order} of {attempt.practice_test}"
        )
        
        serializer = self.get_serializer(attempt)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def submit_module(self, request, pk=None):
        attempt = self.get_object()
        if not attempt.current_module:
            return Response({'error': 'No active module to submit'}, status=status.HTTP_400_BAD_REQUEST)
            
        module_answers = request.data.get('answers', {})
        flagged = request.data.get('flagged', [])
        current_mod_order = attempt.current_module.module_order if attempt.current_module else "?"
        
        try:
            attempt.submit_module(module_answers, flagged)
            
            AuditLog.objects.create(
                user=request.user,
                action="SUBMIT_MODULE",
                details=f"Submitted module {current_mod_order} of {attempt.practice_test}"
            )
            
            serializer = self.get_serializer(attempt)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def save_attempt(self, request, pk=None):
        attempt = self.get_object()
        if not attempt.current_module:
            return Response({'error': 'No active module to save'}, status=status.HTTP_400_BAD_REQUEST)
            
        module_answers = request.data.get('answers', {})
        flagged = request.data.get('flagged', [])
        
        attempt.module_answers[str(attempt.current_module.id)] = module_answers
        attempt.flagged_questions[str(attempt.current_module.id)] = flagged
        attempt.save()
        
        return Response({'status': 'saved'})

    @action(detail=True, methods=['get'])
    def review(self, request, pk=None):
        attempt = self.get_object()
        module_id_param = request.query_params.get('module_id')
        
        questions_data = []
        total_answered = 0
        total_correct = 0
        total_questions = 0
        
        # Performance optimization: Fetch all relevant modules and questions at once
        relevant_module_ids = [mid for mid in attempt.module_answers.keys() 
                             if not module_id_param or str(mid) == str(module_id_param)]
        
        modules = Module.objects.filter(id__in=relevant_module_ids).prefetch_related('questions')
        modules_map = {str(m.id): m for m in modules}

        for module_id, answers in attempt.module_answers.items():
            if module_id_param and str(module_id) != str(module_id_param):
                continue
                
            module = modules_map.get(str(module_id))
            if not module: continue
            
            for q in module.questions.all():
                total_questions += 1
                ans = answers.get(str(q.id))
                
                is_correct = q.check_answer(ans)
                if ans is not None and str(ans).strip() != "": 
                    total_answered += 1
                    if is_correct: total_correct += 1
                
                questions_data.append({
                    'id': q.id,
                    'text': q.question_text,
                    'question_prompt': q.question_prompt,
                    'image': q.question_image.url if q.question_image else None,
                    'type': q.get_question_type_display(),
                    'student_answer': ans,
                    'correct_answers': q.correct_answers,
                    'is_correct': is_correct,
                    'is_math_input': q.is_math_input,
                    'options': q.get_options(),
                })
        
        total_skipped = total_questions - total_answered
        
        return Response({
            'questions': questions_data,
            'module_results': attempt.get_module_results(),
            'total_questions': total_questions,
            'total_answered': total_answered,
            'total_correct': total_correct,
            'total_incorrect': total_questions - total_correct - total_skipped,
            'total_skipped': total_skipped,
            'total_score': attempt.score,
            'score_percentage': (total_correct / total_questions * 100) if total_questions > 0 else 0
        })

# ── Admin CRUD Viewsets ───────────────────────────────────────────────────────

class AdminMockExamViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, MockExamAdminAccess]
    serializer_class = AdminMockExamSerializer

    def get_queryset(self):
        return filter_mock_exams_for_user(
            self.request.user, MockExam.objects.all().prefetch_related("tests__modules")
        )

    def perform_create(self, serializer):
        exam = serializer.save()
        self._provision_exam_after_create(exam)

    def _provision_exam_after_create(self, exam: MockExam):
        """Auto-create practice tests: full mock → RW + Math; midterm → one test + custom modules."""
        if exam.kind == MockExam.KIND_MIDTERM:
            if exam.tests.exists():
                return
            cnt = min(2, max(1, exam.midterm_module_count or 1))
            m1 = max(1, exam.midterm_module1_minutes or 60)
            m2 = max(1, exam.midterm_module2_minutes or 60)
            subj = exam.midterm_subject or "READING_WRITING"
            pt = PracticeTest.objects.create(
                mock_exam=exam,
                subject=subj,
                form_type="INTERNATIONAL",
                skip_default_modules=True,
            )
            Module.objects.create(practice_test=pt, module_order=1, time_limit_minutes=m1)
            if cnt >= 2:
                Module.objects.create(practice_test=pt, module_order=2, time_limit_minutes=m2)
            return

        subs = set(exam.tests.values_list("subject", flat=True))
        if "READING_WRITING" not in subs:
            PracticeTest.objects.create(
                mock_exam=exam,
                subject="READING_WRITING",
                form_type="INTERNATIONAL",
            )
        if "MATH" not in subs:
            PracticeTest.objects.create(
                mock_exam=exam,
                subject="MATH",
                form_type="INTERNATIONAL",
            )

    @action(detail=True, methods=['post'])
    def assign_users(self, request, pk=None):
        exam = self.get_object()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = list(User.objects.filter(id__in=request.data.get('user_ids', [])))
        
        # Default single exam assign: assign to all tests in that exam
        for test in exam.tests.all():
            test.assigned_users.set(users)
            
        return Response({'status': 'assigned', 'users_count': len(users)})

    @action(detail=True, methods=['post'])
    def add_test(self, request, pk=None):
        """Create a new PracticeTest (with auto-generated modules) under this MockExam."""
        exam = self.get_object()
        if exam.kind == MockExam.KIND_MIDTERM:
            return Response(
                {
                    "error": "Midterm exams have a single section with custom modules; add questions under that test."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        subject = request.data.get('subject')
        label = request.data.get('label', '')
        form_type = request.data.get('form_type', 'INTERNATIONAL')
        
        if subject not in ('READING_WRITING', 'MATH'):
            return Response({'error': 'Invalid subject'}, status=status.HTTP_400_BAD_REQUEST)
        
        test = PracticeTest.objects.create(
            mock_exam=exam, 
            subject=subject,
            label=label,
            form_type=form_type
        )
        from .serializers import AdminPracticeTestSerializer
        return Response(AdminPracticeTestSerializer(test).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'])
    def remove_test(self, request, pk=None):
        """Remove a PracticeTest from this MockExam."""
        test_id = request.data.get('test_id')
        test = get_object_or_404(PracticeTest, id=test_id, mock_exam=self.get_object())
        test.delete()
        return Response({'status': 'removed'})


class AdminPracticeTestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, PracticeTestAdminAccess]
    serializer_class = AdminPracticeTestSerializer

    def get_queryset(self):
        return filter_practice_tests_for_user(
            self.request.user, PracticeTest.objects.all().prefetch_related("modules")
        )


class AdminModuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ModuleNestedAdminAccess]
    serializer_class = AdminModuleSerializer

    def get_queryset(self):
        return Module.objects.filter(practice_test_id=self.kwargs['test_pk'])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['test'] = get_object_or_404(PracticeTest, pk=self.kwargs['test_pk'])
        return ctx

    def perform_create(self, serializer):
        test = get_object_or_404(PracticeTest, pk=self.kwargs['test_pk'])
        serializer.save(practice_test=test)


from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db import models as db_models

class AdminQuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, QuestionNestedAdminAccess]
    serializer_class = AdminQuestionSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]


    def get_queryset(self):
        return Question.objects.filter(module_id=self.kwargs['module_pk'], module__practice_test_id=self.kwargs['test_pk'])

    def perform_create(self, serializer):
        module = get_object_or_404(Module, pk=self.kwargs['module_pk'], practice_test_id=self.kwargs['test_pk'])
        # Auto-assign order to the end
        max_order = self.get_queryset().aggregate(db_models.Max('order'))['order__max']
        serializer.save(
            module=module,
            order=(max_order + 1) if max_order is not None else 1
        )

    @action(detail=True, methods=['post'])
    def reorder(self, request, test_pk=None, module_pk=None, pk=None):
        question = self.get_object()
        action_type = request.data.get('action') # 'up' or 'down'
        queryset = self.get_queryset()
        
        if action_type == 'up':
            target = queryset.filter(order__lt=question.order).order_by('-order').first()
        elif action_type == 'down':
            target = queryset.filter(order__gt=question.order).order_by('order').first()
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
            
        if target:
            old_order = question.order
            question.order = target.order
            target.order = old_order
            question.save()
            target.save()
            return Response({'status': 'reordered'})
        return Response({'message': 'Already at boundary'}, status=status.HTTP_400_BAD_REQUEST)
