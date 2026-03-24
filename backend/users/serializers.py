from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class UserMeSerializer(serializers.ModelSerializer):
    last_mock_result = serializers.SerializerMethodField(read_only=True)
    profile_image_url = serializers.SerializerMethodField(read_only=True)
    clear_profile_image = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "profile_image",
            "profile_image_url",
            "sat_exam_date",
            "target_score",
            "last_mock_result",
            "clear_profile_image",
        ]
        extra_kwargs = {
            "profile_image": {"required": False, "allow_null": True},
            "username": {"required": False},
            "first_name": {"required": False},
            "last_name": {"required": False},
            "email": {"required": False},
        }

    def validate_username(self, value):
        if value is not None and value != "" and len(value.strip()) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters.")
        return value

    def validate_first_name(self, value):
        if value is not None and value.strip() and len(value.strip()) < 3:
            raise serializers.ValidationError("First name must be at least 3 characters.")
        return value

    def validate_last_name(self, value):
        if value is not None and value.strip() and len(value.strip()) < 3:
            raise serializers.ValidationError("Last name must be at least 3 characters.")
        return value

    def validate_email(self, value):
        user_qs = User.objects.filter(email__iexact=value)
        if self.instance and self.instance.pk:
            user_qs = user_qs.exclude(pk=self.instance.pk)
        if user_qs.exists():
            raise serializers.ValidationError("user with this email already exists.")
        return value

    def validate_target_score(self, value):
        if value is None:
            return value
        if value < 400 or value > 1600:
            raise serializers.ValidationError("Target score must be between 400 and 1600.")
        return value

    def get_profile_image_url(self, obj):
        if not obj.profile_image:
            return None
        request = self.context.get("request")
        url = obj.profile_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_last_mock_result(self, obj):
        from exams.models import TestAttempt

        att = (
            TestAttempt.objects.filter(student=obj, is_completed=True)
            .filter(practice_test__mock_exam__isnull=False)
            .select_related("practice_test__mock_exam")
            .order_by("-submitted_at", "-id")
            .first()
        )
        if not att:
            return None
        mock = att.practice_test.mock_exam if att.practice_test else None
        completed = att.submitted_at
        return {
            "score": att.score,
            "mock_exam_title": mock.title if mock else None,
            "practice_test_subject": att.practice_test.subject if att.practice_test else None,
            "completed_at": completed.isoformat() if completed else None,
        }

    def update(self, instance, validated_data):
        clear = validated_data.pop("clear_profile_image", False)
        if clear:
            if instance.profile_image:
                instance.profile_image.delete(save=False)
            instance.profile_image = None
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("profile_image", None)
        return data

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token['is_admin'] = user.is_admin
        token['role'] = user.role
        token['is_frozen'] = user.is_frozen
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['is_admin'] = self.user.is_admin
        data['role'] = self.user.role
        data['is_frozen'] = self.user.is_frozen
        return data

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    is_admin = serializers.BooleanField(required=False)

    def validate_username(self, value):
        if value == '':
            return None
        if value is not None and len(value.strip()) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters.")
        return value

    def validate_first_name(self, value):
        if value is not None and value.strip() and len(value.strip()) < 3:
            raise serializers.ValidationError("First name must be at least 3 characters.")
        return value

    def validate_last_name(self, value):
        if value is not None and value.strip() and len(value.strip()) < 3:
            raise serializers.ValidationError("Last name must be at least 3 characters.")
        return value

    def validate_email(self, value):
        # Manual unique check to avoid issues with instance exclusion in some environments
        user_qs = User.objects.filter(email__iexact=value)
        if self.instance and self.instance.pk:
            user_qs = user_qs.exclude(pk=self.instance.pk)
        
        if user_qs.exists():
            raise serializers.ValidationError("user with this email already exists.")
        return value

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'role', 'is_admin', 'is_active', 'is_frozen', 'date_joined', 'password']
        read_only_fields = ['date_joined']

    def create(self, validated_data):
        is_admin = validated_data.pop('is_admin', None)
        if 'role' not in validated_data and is_admin is not None:
            validated_data['role'] = 'ADMIN' if is_admin else 'STUDENT'
        
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        is_admin = validated_data.pop('is_admin', None)
        role = validated_data.get('role', None)
        
        if role is not None:
            instance.role = role
            instance.save()
        elif is_admin is not None:
            instance.role = 'ADMIN' if is_admin else 'STUDENT'
            instance.save()

        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

