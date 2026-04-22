from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from .models import Module, TestAttempt


@dataclass(frozen=True)
class ModuleTiming:
    now: timezone.datetime
    started_at: timezone.datetime
    limit_seconds: int

    @property
    def elapsed_seconds(self) -> int:
        dt = self.now - self.started_at
        sec = int(dt.total_seconds())
        return max(0, sec)

    @property
    def remaining_seconds(self) -> int:
        return max(0, int(self.limit_seconds) - self.elapsed_seconds)

    @property
    def is_expired(self) -> bool:
        return self.elapsed_seconds >= int(self.limit_seconds)


def get_active_module_timing(
    attempt: TestAttempt, *, now: timezone.datetime | None = None
) -> ModuleTiming | None:
    """
    Compute timing for the currently active module (if any).
    Server-authoritative: uses stored module start timestamps + Module.time_limit_minutes.
    """
    mod: Module | None = getattr(attempt, "current_module", None)
    if not mod:
        return None
    started = getattr(attempt, "current_module_start_time", None)
    if not started:
        return None
    if now is None:
        now = timezone.now()
    limit_seconds = int(getattr(mod, "time_limit_minutes", 0) or 0) * 60
    if limit_seconds <= 0:
        # Defensive: treat missing limits as "no expiry" rather than expiring instantly.
        limit_seconds = 10**9
    return ModuleTiming(now=now, started_at=started, limit_seconds=limit_seconds)

