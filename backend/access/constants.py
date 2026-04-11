"""Authorization constants for RBAC + scope-based access.

RBAC determines *what* a user can do (permission codenames).
Scope determines *where* they can do it (domains like math / english).
"""

WILDCARD = "*"

# Canonical permission codenames (spec)
PERM_MANAGE_USERS = "manage_users"
PERM_ASSIGN_ACCESS = "assign_access"
PERM_CREATE_CLASSROOM = "create_classroom"
PERM_MANAGE_TESTS = "manage_tests"
PERM_VIEW_DASHBOARD = "view_dashboard"
PERM_SUBMIT_TEST = "submit_test"

ALL_PERMISSION_CODENAMES = (
    PERM_SUBMIT_TEST,
    PERM_MANAGE_USERS,
    PERM_ASSIGN_ACCESS,
    PERM_CREATE_CLASSROOM,
    PERM_MANAGE_TESTS,
    PERM_VIEW_DASHBOARD,
)

# Canonical scope keys (domains)
SCOPE_MATH = "math"
SCOPE_ENGLISH = "english"
ALL_SCOPES = (SCOPE_MATH, SCOPE_ENGLISH)

# Platform subject values stored in DB (PracticeTest.subject)
SUBJECT_ENGLISH_PLATFORM = "READING_WRITING"  # "English / R&W"
SUBJECT_MATH_PLATFORM = "MATH"

# Canonical RBAC roles (lowercase, per spec)
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_TEACHER = "teacher"
ROLE_TEST_ADMIN = "test_admin"
ROLE_STUDENT = "student"
