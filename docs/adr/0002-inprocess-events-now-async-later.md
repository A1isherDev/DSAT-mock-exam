## ADR 0002: In-process events now, async later

### Status
Accepted

### Context
Domains need event-driven side effects (assignment created, attempt submitted, grading completed,
session revoked). Introducing a full async bus immediately increases operational complexity.

### Decision
Add `core/events` as a synchronous in-process event bus first. Define event types and handlers.
Keep an upgrade path to async delivery (Celery/Redis) by keeping producer APIs stable.

### Consequences
- No new infra required immediately.
- Handlers must remain best-effort and non-blocking.
- Future: swap `publish()` implementation or add async dispatch without changing call sites.

