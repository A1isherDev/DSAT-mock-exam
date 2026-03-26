from rest_framework.permissions import BasePermission


class IsAdminUser(BasePermission):
    """
    App-level admin check: reuse user's `is_admin` convenience property.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and getattr(request.user, "is_admin", False))


class IsClassMember(BasePermission):
    """
    Require the current user to be a member of the classroom.
    Assumes view has `get_classroom()` method.
    """

    message = "You are not a member of this class."

    def has_permission(self, request, view):
        classroom = getattr(view, "get_classroom", lambda: None)()
        if classroom is None:
            return False
        return classroom.memberships.filter(user=request.user).exists()


class IsClassAdmin(BasePermission):
    """
    Require the current user to be an ADMIN member of the classroom.
    Assumes view has `get_classroom()` method.
    """

    message = "You do not have permission to manage this class."

    def has_permission(self, request, view):
        classroom = getattr(view, "get_classroom", lambda: None)()
        if classroom is None:
            return False
        return classroom.memberships.filter(user=request.user, role="ADMIN").exists()

