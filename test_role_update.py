import os
import sys
import django
from rest_framework import serializers

# Set up Django environment
sys.path.append('d:\\SAT_Fergana\\MockExamStandalone\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User
from users.serializers import UserSerializer

def test_user_update_with_role():
    # Find a student user to test with
    user = User.objects.filter(role='STUDENT').first()
    if not user:
        # Create a temp user if none found
        user = User.objects.create_user(email='test_role@example.com', password='password123', username='test_role')
    
    print(f"Initial: User {user.email}, role: {user.role}")
    
    # 1. Test promoting to ADMIN via 'role' field
    data = {'role': 'ADMIN'}
    serializer = UserSerializer(instance=user, data=data, partial=True)
    if serializer.is_valid():
        serializer.save()
        user.refresh_from_db()
        print(f"After role=ADMIN: role: {user.role}, is_admin prop: {user.is_admin}")
        assert user.role == 'ADMIN'
        assert user.is_admin is True
    else:
        print(f"Role update failed: {serializer.errors}")
        return

    # 2. Test demoting to STUDENT via 'is_admin' field
    data = {'is_admin': False}
    serializer = UserSerializer(instance=user, data=data, partial=True)
    if serializer.is_valid():
        serializer.save()
        user.refresh_from_db()
        print(f"After is_admin=False: role: {user.role}, is_admin prop: {user.is_admin}")
        assert user.role == 'STUDENT'
        assert user.is_admin is False
    else:
        print(f"is_admin update failed: {serializer.errors}")
        return

    # 3. Test sending both (synced)
    data = {'role': 'ADMIN', 'is_admin': True}
    serializer = UserSerializer(instance=user, data=data, partial=True)
    if serializer.is_valid():
        serializer.save()
        user.refresh_from_db()
        print(f"After sending both=ADMIN: role: {user.role}")
        assert user.role == 'ADMIN'
    else:
        print(f"Dual update failed: {serializer.errors}")
        return

    print("All role tests passed!")

if __name__ == "__main__":
    try:
        test_user_update_with_role()
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
