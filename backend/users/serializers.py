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

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 'role', 'is_admin', 'is_active', 'date_joined', 'password']
        read_only_fields = ['date_joined']

    def create(self, validated_data):
        is_admin = validated_data.pop('is_admin', None)
        if is_admin is not None:
            validated_data['role'] = 'ADMIN' if is_admin else 'STUDENT'
        
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        is_admin = validated_data.pop('is_admin', None)
        if is_admin is not None:
            instance.role = 'ADMIN' if is_admin else 'STUDENT'
            # We don't need to add it to validated_data for super().update 
            # because it's a model property that is now handled here.
            # But we should save the instance if we changed the role.
            instance.save()

        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

