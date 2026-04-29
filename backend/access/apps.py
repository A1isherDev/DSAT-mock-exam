from django.apps import AppConfig


class AccessConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "access"
    verbose_name = "Access control (RBAC/ABAC)"

    def ready(self):
        # Wire core event handlers (best-effort import).
        try:
            from core.events import get_event_bus
            from core.events.events import SessionRevoked
            from core.metrics import incr

            bus = get_event_bus()

            def _on_session_revoked(evt: SessionRevoked) -> None:
                incr("auth.session_revoked")

            bus.subscribe(SessionRevoked, _on_session_revoked)
        except Exception:
            return
