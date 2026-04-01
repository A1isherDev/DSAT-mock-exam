"""Permission codenames and platform subject values (ABAC)."""

WILDCARD = "*"

# Granular permissions (spec)
PERM_MANAGE_USERS = "manage_users"
PERM_MANAGE_ROLES = "manage_roles"
PERM_CREATE_TEST = "create_test"
PERM_EDIT_TEST = "edit_test"
PERM_DELETE_TEST = "delete_test"
PERM_VIEW_ALL_TESTS = "view_all_tests"
PERM_ASSIGN_TEST_ACCESS = "assign_test_access"
PERM_VIEW_ENGLISH_TESTS = "view_english_tests"
PERM_VIEW_MATH_TESTS = "view_math_tests"
PERM_SUBMIT_TEST = "submit_test"

# LMS areas not in the original spec list — assigned only to SUPER_ADMIN / ADMIN.
PERM_MANAGE_CLASSROOMS = "manage_classrooms"
# Next.js /admin panel (separate from Django is_staff / django-admin).
PERM_ACCESS_LMS_ADMIN = "access_lms_admin"
# Timed mock shells: full SAT vs midterm-only (teachers may create midterms only).
PERM_CREATE_MOCK_SAT = "create_mock_sat"
PERM_CREATE_MIDTERM_MOCK = "create_midterm_mock"

ALL_PERMISSION_CODENAMES = (
    PERM_MANAGE_USERS,
    PERM_MANAGE_ROLES,
    PERM_CREATE_TEST,
    PERM_EDIT_TEST,
    PERM_DELETE_TEST,
    PERM_VIEW_ALL_TESTS,
    PERM_ASSIGN_TEST_ACCESS,
    PERM_VIEW_ENGLISH_TESTS,
    PERM_VIEW_MATH_TESTS,
    PERM_SUBMIT_TEST,
    PERM_MANAGE_CLASSROOMS,
    PERM_ACCESS_LMS_ADMIN,
    PERM_CREATE_MOCK_SAT,
    PERM_CREATE_MIDTERM_MOCK,
)

# SAT practice tests use READING_WRITING for the English/R&W section.
SUBJECT_ENGLISH_PLATFORM = "READING_WRITING"
SUBJECT_MATH_PLATFORM = "MATH"

ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_ADMIN = "ADMIN"
ROLE_TEST_ADMIN = "TEST_ADMIN"
ROLE_TEACHER = "TEACHER"
ROLE_ENGLISH_ADMIN = "ENGLISH_ADMIN"
ROLE_MATH_ADMIN = "MATH_ADMIN"
ROLE_STUDENT = "STUDENT"
