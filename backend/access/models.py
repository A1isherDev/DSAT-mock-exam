from django.conf import settings
from django.db import models

from . import constants


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
