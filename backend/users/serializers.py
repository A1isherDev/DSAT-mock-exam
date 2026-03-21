from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token['is_admin'] = user.is_admin
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['is_admin'] = self.user.is_admin
        return data

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    is_admin = serializers.BooleanField(required=False)

    def validate_username(self, value):
        if value == '':
            return None
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
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'role', 'is_admin', 'is_active', 'date_joined', 'password']
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

