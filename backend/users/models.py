from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class ExamDateOption(models.Model):
    """Admin-defined SAT/exam dates students may choose from (profile dropdown)."""

    exam_date = models.DateField(unique=True, db_index=True)
    label = models.CharField(max_length=200, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "users_exam_date_option"
        ordering = ["sort_order", "exam_date"]

    def __str__(self):
        return self.label.strip() or str(self.exam_date)


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        role = extra_fields.pop("role", None)
        scope = extra_fields.pop("scope", None)
        system_role = extra_fields.pop("system_role", None)  # legacy; kept for DB compatibility
        user = self.model(email=email, **extra_fields)
        # Canonical authorization fields (RBAC + scope)
        if isinstance(role, str) and role.strip():
            user.role = role.strip()
        if scope is not None:
            user.scope = scope
        # Do not derive role from system_role anymore; it is legacy.
        if system_role is not None:
            user.system_role = system_role
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "super_admin")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True, null=True, blank=True, db_index=True)
    email = models.EmailField(unique=True, db_index=True)
    system_role = models.ForeignKey(
        "access.Role",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )
    is_frozen = models.BooleanField(default=False, db_index=True)
    # Canonical RBAC + scope fields
    role = models.CharField(max_length=30, default="student", db_index=True)
    scope = models.JSONField(default=list, blank=True)
    profile_image = models.ImageField(upload_to='profiles/', null=True, blank=True)
    sat_exam_date = models.DateField(null=True, blank=True, help_text='Planned SAT exam date')
    target_score = models.PositiveIntegerField(null=True, blank=True, help_text='Target total SAT score (400–1600)')
    phone_number = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text="E.164-style or local digits; optional, unique when set (e.g. for Telegram users).",
    )
    telegram_id = models.BigIntegerField(
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text="Telegram user id when linked or signed up via Telegram.",
    )

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    objects = UserManager()
    
    class Meta:
        db_table = 'users'
    
    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def is_student(self):
        from access import constants

        return self.role == constants.ROLE_STUDENT

    @property
    def is_admin(self):
        """True if user has any LMS staff capability (permissions-based)."""
        from access.services import is_lms_staff_user

        return is_lms_staff_user(self)
