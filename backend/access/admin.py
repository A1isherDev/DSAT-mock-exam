from django.contrib import admin

from .models import Permission, Role, RolePermission, UserPermission


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("codename", "name")
    search_fields = ("codename", "name")


class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 0
    autocomplete_fields = ("permission",)


class RoleModelAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
    search_fields = ("code", "name")
    inlines = [RolePermissionInline]


admin.site.register(Role, RoleModelAdmin)


@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = ("user", "permission", "granted")
    list_filter = ("granted",)
    autocomplete_fields = ("user", "permission")
