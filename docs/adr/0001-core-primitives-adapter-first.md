## ADR 0001: Core primitives, adapter-first migration

### Status
Accepted

### Context
Multiple domains (`exams`, `assessments`, `classes`) implemented overlapping primitives:
authorization checks, idempotency, state transitions, metrics, and error shapes. These were
drifting and causing regressions.

### Decision
Introduce `backend/core/` as the **shared primitive layer** and migrate incrementally using
**adapters** that delegate to existing domain implementations first (no behavior change).

### Consequences
- Short-term: extra indirection (core modules call legacy modules).
- Medium-term: domains stop importing `access.*`/domain metrics/idempotency directly.
- Long-term: core becomes the single source of truth; regressions become harder to introduce.

