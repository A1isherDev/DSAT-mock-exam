from __future__ import annotations

from django.conf import settings
from django.db import models

from .constants import PRIORITY_CHOICES, PRIORITY_MEDIUM


class RealtimeEvent(models.Model):
    """
    Durable outbox for push delivery (SSE/WebSocket).

    Events are *delivery hints only*; clients still refetch canonical REST endpoints.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="realtime_events",
        db_index=True,
    )
    event_type = models.CharField(max_length=64, db_index=True)
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM, db_index=True)
    dedupe_key = models.CharField(max_length=64, blank=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "realtime_events"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["user", "id"]),
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["user", "dedupe_key", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"RealtimeEvent#{self.pk} {self.event_type} user={self.user_id}"

