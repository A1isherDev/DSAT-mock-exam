from __future__ import annotations

"""
Core metrics facade.

Adapter-first: delegate to existing `exams.metrics` implementation (cache-backed counters).
In later refactors, domains should call `core.metrics.*` and not import per-domain metrics modules.
"""

from exams.metrics import get_counter, incr

__all__ = ["incr", "get_counter"]

