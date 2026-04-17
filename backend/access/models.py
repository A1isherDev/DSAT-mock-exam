from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from . import constants


class UserAccess(models.Model):
    """
    DB-backed access grant: user may act within a domain subject globally or for one classroom.

    Uniqueness on (user, subject, classroom) prevents duplicate rows. ``granted_by`` is set on
    create and **refreshed on each duplicate POST** to ``/api/access/grant/`` (latest actor wins;
    there is no separate historical audit table).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="access_grants",
    )
    subject = models.CharField(
        max_length=16,
        choices=[(constants.DOMAIN_MATH, "Math"), (constants.DOMAIN_ENGLISH, "English")],
        db_index=True,
    )
    classroom = models.ForeignKey(
        "classes.Classroom",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="access_grants",
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="access_grants_given",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "access_user_access"
        indexes = [
            models.Index(fields=["user", "subject"]),
            models.Index(fields=["user", "subject", "classroom"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "subject", "classroom"],
                name="access_user_access_unique_user_subject_classroom",
            )
        ]

    def __str__(self) -> str:
        c = f" class={self.classroom_id}" if self.classroom_id else " global"
        return f"{self.user_id} {self.subject}{c}"


class Permission(models.Model):
    codename = models.SlugField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)

    class Meta:
        db_table = "access_permissions"
        ordering = ["codename"]

    def __str__(self):
        return self.codename


class Role(models.Model):
    code = models.SlugField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=64)
    description = models.TextField(blank=True)

    permissions = models.ManyToManyField(
        Permission,
        through="RolePermission",
        related_name="roles",
        blank=True,
    )

    class Meta:
        db_table = "access_roles"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code}"


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission, on_delete=models.CASCADE, related_name="role_permissions"
    )

    class Meta:
        db_table = "access_role_permissions"
        unique_together = [("role", "permission")]


class UserPermission(models.Model):
    """Optional per-user grant (True) or explicit deny (False). Deny wins over role."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="access_overrides",
    )
    permission = models.ForeignKey(
        Permission, on_delete=models.CASCADE, related_name="user_overrides"
    )
    granted = models.BooleanField(default=True)

    class Meta:
        db_table = "access_user_permissions"
        unique_together = [("user", "permission")]

    def clean(self) -> None:
        super().clean()
        from access.services import normalized_role

        role = normalized_role(self.user)
        if (
            self.granted
            and role == constants.ROLE_STUDENT
            and self.permission.codename in constants.PERMISSIONS_STUDENT_OVERRIDE_DENIED
        ):
            raise ValidationError(
                {
                    "permission": (
                        "Students cannot be granted this permission via override; "
                        "subject-scoped staff permissions are not transferable."
                    )
                }
            )
