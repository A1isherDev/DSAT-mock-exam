from rest_framework import serializers
from .models import Question, PracticeTest, Module, TestAttempt, MockExam

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'question_type', 'question_text', 'question_prompt', 'question_image', 'is_math_input']
        
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        
        # Build the options dict dynamically to prevent breaking the frontend
        options = {}
        if instance.option_a: options['A'] = instance.option_a
        if instance.option_b: options['B'] = instance.option_b
        if instance.option_c: options['C'] = instance.option_c
        if instance.option_d: options['D'] = instance.option_d
            
        representation['options'] = options if options else None
        return representation

class ModuleSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes', 'questions']

class ModuleListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes']

class PracticeTestSerializer(serializers.ModelSerializer):
    modules = ModuleListSerializer(many=True, read_only=True)
    subject = serializers.CharField()
    
    class Meta:
        model = PracticeTest
        fields = ['id', 'subject', 'modules']

class MockExamSerializer(serializers.ModelSerializer):
    tests = PracticeTestSerializer(many=True, read_only=True)
    
    class Meta:
        model = MockExam
        fields = ['id', 'title', 'practice_date', 'is_active', 'tests']

from users.serializers import UserSerializer

class TestAttemptSerializer(serializers.ModelSerializer):
    practice_test_details = serializers.SerializerMethodField()
    current_module_details = ModuleSerializer(source='current_module', read_only=True)
    student_details = UserSerializer(source='student', read_only=True)
    is_expired = serializers.SerializerMethodField()
    module_results = serializers.SerializerMethodField()

    def get_is_expired(self, obj):
        return getattr(obj, 'is_expired', False)
        
    def get_module_results(self, obj):
        return obj.get_module_results() if obj.is_completed else None

    def get_practice_test_details(self, obj):
        pt = obj.practice_test
        mock = pt.mock_exam
        return {
            'id': pt.id,
            'subject': pt.subject,
            'title': mock.title if mock else '',
            'practice_date': mock.practice_date.isoformat() if mock and mock.practice_date else None,
            'is_active': mock.is_active if mock else True,
            'modules': ModuleListSerializer(pt.modules.all(), many=True).data,
        }
    
    class Meta:
        model = TestAttempt
        fields = [
            'id', 'practice_test', 'practice_test_details', 'student', 'student_details', 'started_at', 'submitted_at', 
            'current_module', 'current_module_details', 'current_module_start_time',
            'is_completed', 'is_expired', 'score', 'completed_modules', 'module_results'
        ]

        read_only_fields = ['student', 'started_at', 'submitted_at', 'current_module', 'current_module_start_time', 'is_completed', 'score', 'completed_modules']

# ── Admin Serializers ────────────────────────────────────────────────────────

class AdminQuestionSerializer(serializers.ModelSerializer):
    correct_answer = serializers.CharField(source='correct_answers', required=True)
    option_a = serializers.CharField(required=False, allow_blank=True)
    option_b = serializers.CharField(required=False, allow_blank=True)
    option_c = serializers.CharField(required=False, allow_blank=True)
    option_d = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Question
        fields = ['id', 'question_type', 'question_text', 'question_prompt', 'question_image',
                  'is_math_input', 'correct_answer', 'score', 'explanation', 'order',
                  'option_a', 'option_b', 'option_c', 'option_d']


class AdminModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['id', 'module_order', 'time_limit_minutes']

    def create(self, validated_data):
        test = self.context['test']
        return Module.objects.create(practice_test=test, **validated_data)


class AdminPracticeTestSerializer(serializers.ModelSerializer):
    modules = AdminModuleSerializer(many=True, read_only=True)
    subject = serializers.CharField()

    class Meta:
        model = PracticeTest
        fields = ['id', 'subject', 'mock_exam', 'modules']


class AdminMockExamSerializer(serializers.ModelSerializer):
    tests = AdminPracticeTestSerializer(many=True, read_only=True)

    class Meta:
        model = MockExam
        fields = ['id', 'title', 'practice_date', 'is_active', 'tests']
