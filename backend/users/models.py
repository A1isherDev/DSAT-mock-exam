from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        legacy_role = extra_fields.pop("role", None)
        system_role = extra_fields.pop("system_role", None)
        user = self.model(email=email, **extra_fields)
        if system_role is None:
            from access.models import Role

            if legacy_role == "ADMIN":
                system_role = Role.objects.get(code="ADMIN")
            else:
                system_role = Role.objects.get(code="STUDENT")
        user.system_role = system_role
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        from access.models import Role

        extra_fields.setdefault("system_role", Role.objects.get(code="SUPER_ADMIN"))
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
    profile_image = models.ImageField(upload_to='profiles/', null=True, blank=True)
    sat_exam_date = models.DateField(null=True, blank=True, help_text='Planned SAT exam date')
    target_score = models.PositiveIntegerField(null=True, blank=True, help_text='Target total SAT score (400–1600)')
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    objects = UserManager()
    
    class Meta:
        db_table = 'users'
    
    def __str__(self):
        rc = self.system_role.code if self.system_role_id else "?"
        return f"{self.email} ({rc})"

    @property
    def role(self):
        """Backward-compatible role code for serializers / JWT (not a DB column)."""
        return self.system_role.code if self.system_role_id else "STUDENT"

    @property
    def is_student(self):
        from access import constants

        if not self.system_role_id:
            return True
        return self.system_role.code == constants.ROLE_STUDENT

    @property
    def is_admin(self):
        """True if user has any LMS staff capability (permissions-based)."""
        from access.services import is_lms_staff_user

        return is_lms_staff_user(self)
