## ADR 0003: Frontend feature modules + split API clients

### Status
Accepted

### Context
Page-level business logic and shared “god API” clients made it easy to accidentally call the
wrong endpoints (e.g. public routes from staff consoles), causing regressions.

### Decision
- Split low-level API clients into:
  - `examsPublicApi`
  - `examsAdminApi`
  - `assessmentsAdminApi`
- Introduce feature APIs under `src/features/*` and have staff pages import feature APIs.
- Add lint restrictions to prevent staff console code from importing public exam clients.

### Consequences
- Improved routing correctness and reviewability.
- Gradual migration: not all pages must move at once, but staff consoles are locked down first.

