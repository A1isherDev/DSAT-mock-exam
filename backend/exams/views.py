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
    PastpaperPackAdminAccess,
    PracticeTestAdminAccess,
    QuestionNestedAdminAccess,
)
from access.services import (
    authorize,
    filter_mock_exams_for_user,
    filter_pastpaper_packs_for_user,
    filter_practice_tests_for_user,
    get_effective_permission_codenames,
)

from .models import (
    PastpaperPack,
    PracticeTest,
    TestAttempt,
    Module,
    Question,
    AuditLog,
    MockExam,
    PortalMockExam,
    ensure_full_mock_practice_test_modules,
)
from .serializers import (
    MockExamSerializer,
    PortalMockExamStudentSerializer,
    PracticeTestSerializer,
    TestAttemptSerializer,
    ModuleSerializer,
    AdminMockExamSerializer,
    AdminPastpaperPackSerializer,
    AdminPracticeTestSerializer,
    AdminModuleSerializer,
    AdminQuestionSerializer,
)


class MockExamViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Timed diagnostic mocks (staff-authored sections, not the pastpaper library).
    List: PortalMockExam rows for students. Retrieve: mock shell + sections for /mock/:id.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MockExamSerializer

    def list(self, request, *args, **kwargs):
        user = request.user
        perms = get_effective_permission_codenames(user)
        if acc_const.WILDCARD in perms or acc_const.PERM_VIEW_ALL_TESTS in perms:
            return super().list(request, *args, **kwargs)
        if {
            acc_const.PERM_VIEW_ENGLISH_TESTS,
            acc_const.PERM_VIEW_MATH_TESTS,
            acc_const.PERM_CREATE_TEST,
            acc_const.PERM_EDIT_TEST,
            acc_const.PERM_DELETE_TEST,
            acc_const.PERM_ASSIGN_TEST_ACCESS,
        } & perms:
            return super().list(request, *args, **kwargs)

        qs = (
            PortalMockExam.objects.filter(
                is_active=True,
                mock_exam__is_active=True,
                mock_exam__is_published=True,
                assigned_users=user,
            ).select_related("mock_exam")
        )
        return Response(PortalMockExamStudentSerializer(qs, many=True).data)

    def get_queryset(self):
        user = self.request.user
        perms = get_effective_permission_codenames(user)
        base = MockExam.objects.filter(is_active=True)
        tests_prefetch = Prefetch(
            "tests",
            queryset=PracticeTest.objects.all().prefetch_related("modules"),
        )
        if acc_const.WILDCARD in perms or acc_const.PERM_VIEW_ALL_TESTS in perms:
            return base.prefetch_related(tests_prefetch)
        if {
            acc_const.PERM_VIEW_ENGLISH_TESTS,
            acc_const.PERM_VIEW_MATH_TESTS,
            acc_const.PERM_CREATE_TEST,
            acc_const.PERM_EDIT_TEST,
            acc_const.PERM_DELETE_TEST,
            acc_const.PERM_ASSIGN_TEST_ACCESS,
        } & perms:
            return filter_mock_exams_for_user(user, base).prefetch_related(tests_prefetch)

        allowed_mock_ids = PortalMockExam.objects.filter(
            is_active=True,
            mock_exam__is_active=True,
            mock_exam__is_published=True,
            assigned_users=user,
        ).values_list("mock_exam_id", flat=True)
        return (
            base.filter(id__in=allowed_mock_ids)
            .prefetch_related(tests_prefetch)
            .distinct()
        )


class PracticeTestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Pastpaper / skill practice only: standalone PracticeTest rows (no mock_exam).
    Timed mocks and their sections are only exposed via mock-exams + /mock/:id.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PracticeTestSerializer

    def _expand_pastpaper_pack_siblings(self, base, qs):
        """
        If the user is assigned any section of a PastpaperPack, include every section in that pack
        (one assignment unlocks the full card on /practice-tests).
        """
        pack_ids = list(
            qs.filter(pastpaper_pack_id__isnull=False)
            .values_list("pastpaper_pack_id", flat=True)
            .distinct()
        )
        if not pack_ids:
            return qs
        sibling_qs = base.filter(pastpaper_pack_id__in=pack_ids)
        return (qs | sibling_qs).distinct()

    def get_queryset(self):
        """
        Single rule for all roles: only PracticeTest rows assigned to this user, plus other sections
        in the same pastpaper pack. No permission-based library fallback (avoids showing other users'
        assignments or unassigned junk). Admins browse/edit everything via /exams/admin/tests/.
        """
        user = self.request.user
        base = (
            PracticeTest.objects.filter(mock_exam__isnull=True)
            .select_related("mock_exam", "pastpaper_pack")
            .prefetch_related("modules")
        )
        mine = base.filter(assigned_users=user).distinct()
        return self._expand_pastpaper_pack_siblings(base, mine)

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, BulkAssignAccess])
    def bulk_assign(self, request):
        exam_ids = request.data.get("exam_ids") or []
        practice_test_ids = request.data.get("practice_test_ids") or []
        user_ids = request.data.get("user_ids", [])
        assignment_type = request.data.get("assignment_type", "FULL")
        form_type = request.data.get("form_type")

        from django.contrib.auth import get_user_model

        User = get_user_model()
        users = list(User.objects.filter(id__in=user_ids))

        if not user_ids:
            return Response({"detail": "user_ids is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not exam_ids and not practice_test_ids:
            return Response(
                {"detail": "Provide exam_ids (mock exams) and/or practice_test_ids (pastpaper tests)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        added_count = 0
        removed_count = 0

        if practice_test_ids:
            pts = PracticeTest.objects.filter(pk__in=practice_test_ids, mock_exam__isnull=True)
            for pt in pts:
                if authorize(request.user, acc_const.PERM_ASSIGN_TEST_ACCESS, subject=pt.subject):
                    pt.assigned_users.add(*users)
                    added_count += 1

        mock_ids_touched = set()
        if exam_ids:
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
            for pt in add_tests:
                if authorize(request.user, acc_const.PERM_ASSIGN_TEST_ACCESS, subject=pt.subject):
                    pt.assigned_users.add(*users)
                    added_count += 1
                    if pt.mock_exam_id:
                        mock_ids_touched.add(pt.mock_exam_id)

            for me in MockExam.objects.filter(pk__in=mock_ids_touched):
                portal = PortalMockExam.objects.filter(mock_exam=me, is_active=True).first()
                if portal:
                    portal.assigned_users.add(*users)

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
                "practice_tests_count": len(practice_test_ids),
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

        # Full SAT mock: admin adds R&W / Math sections via add_test (no forced two-section shell).

    @action(detail=True, methods=['post'])
    def assign_users(self, request, pk=None):
        exam = self.get_object()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = list(User.objects.filter(id__in=request.data.get('user_ids', [])))
        
        exam.assigned_users.set(users)
        for test in exam.tests.all():
            test.assigned_users.set(users)
        portal = PortalMockExam.objects.filter(mock_exam=exam).first()
        if portal:
            portal.assigned_users.set(users)

        return Response({'status': 'assigned', 'users_count': len(users)})

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        from django.utils import timezone

        from .publish_service import mock_exam_publish_ready

        exam = self.get_object()
        ok, msg = mock_exam_publish_ready(exam)
        if not ok:
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        exam.is_published = True
        exam.published_at = timezone.now()
        exam.save(update_fields=["is_published", "published_at", "updated_at"])
        portal, _ = PortalMockExam.objects.get_or_create(
            mock_exam=exam,
            defaults={"is_active": True},
        )
        portal.is_active = True
        portal.save(update_fields=["is_active", "updated_at"])
        if exam.assigned_users.exists():
            portal.assigned_users.set(exam.assigned_users.all())
        exam = MockExam.objects.prefetch_related("tests__modules__questions").get(pk=exam.pk)
        return Response(AdminMockExamSerializer(exam).data)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        exam = self.get_object()
        exam.is_published = False
        exam.published_at = None
        exam.save(update_fields=["is_published", "published_at", "updated_at"])
        PortalMockExam.objects.filter(mock_exam=exam).update(is_active=False)
        exam = MockExam.objects.prefetch_related("tests__modules__questions").get(pk=exam.pk)
        return Response(AdminMockExamSerializer(exam).data)

    @action(detail=True, methods=['post'])
    def add_test(self, request, pk=None):
        """Create a mock-only section (new items; do not reuse pastpaper PracticeTest rows)."""
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
        ensure_full_mock_practice_test_modules(test)
        from .serializers import AdminPracticeTestSerializer
        return Response(AdminPracticeTestSerializer(test).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'])
    def remove_test(self, request, pk=None):
        """Remove a PracticeTest from this MockExam."""
        test_id = request.data.get('test_id')
        test = get_object_or_404(PracticeTest, id=test_id, mock_exam=self.get_object())
        test.delete()
        return Response({'status': 'removed'})


class AdminPastpaperPackViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, PastpaperPackAdminAccess]
    serializer_class = AdminPastpaperPackSerializer

    def get_queryset(self):
        return (
            filter_pastpaper_packs_for_user(
                self.request.user,
                PastpaperPack.objects.all().prefetch_related(
                    "sections__modules",
                    "sections__assigned_users",
                ),
            )
            .order_by("-practice_date", "-id")
        )

    def perform_update(self, serializer):
        pack = serializer.save()
        PracticeTest.objects.filter(pastpaper_pack=pack).update(
            practice_date=pack.practice_date,
            label=pack.label,
            form_type=pack.form_type,
        )

    @action(detail=True, methods=["post"])
    def add_section(self, request, pk=None):
        pack = self.get_object()
        subject = request.data.get("subject")
        if subject not in ("READING_WRITING", "MATH"):
            return Response({"detail": "Invalid subject."}, status=status.HTTP_400_BAD_REQUEST)
        if pack.sections.filter(subject=subject).exists():
            return Response(
                {"detail": "This pack already has that section."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        title = (request.data.get("title") or "").strip()
        pt = PracticeTest.objects.create(
            mock_exam=None,
            pastpaper_pack=pack,
            subject=subject,
            title=title,
            label=pack.label or "",
            form_type=pack.form_type or "INTERNATIONAL",
            practice_date=pack.practice_date,
        )
        pt = (
            PracticeTest.objects.filter(pk=pt.pk)
            .prefetch_related("modules", "assigned_users")
            .first()
        )
        return Response(AdminPracticeTestSerializer(pt).data, status=status.HTTP_201_CREATED)


class AdminPracticeTestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, PracticeTestAdminAccess]
    serializer_class = AdminPracticeTestSerializer

    def get_queryset(self):
        qs = filter_practice_tests_for_user(
            self.request.user,
            PracticeTest.objects.all().prefetch_related("modules", "assigned_users"),
        )
        standalone = self.request.query_params.get("standalone")
        if standalone in ("1", "true", "yes"):
            qs = qs.filter(mock_exam__isnull=True)
        return qs


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
