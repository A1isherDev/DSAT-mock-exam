# Phase 2 — ERD & Schema

## Entity-relationship diagram

```
                         ┌─────────────────────────┐
                         │        users.User       │
                         └────────────┬────────────┘
                                      │ user / granted_by
                                      │
              ┌───────────────────────▼─────────────────────────┐
              │            ResourceAccessGrant                   │
              │  (table: resource_access_grants)                 │
              ├──────────────────────────────────────────────────┤
              │ id            BIGSERIAL PK                        │
              │ user_id       FK users.User (CASCADE)            │
              │ scope         varchar(8)  SUBJECT|RESOURCE        │
              │ subject       varchar(16) NULL  (math|english)    │  ← SUBJECT scope
              │ resource_type varchar(32) NULL                    │  ← RESOURCE scope
              │ resource_id   bigint      NULL                    │  ← RESOURCE scope
              │ classroom_id  FK classes.Classroom NULL (CASCADE) │  ← optional context
              │ source        varchar(12) MANUAL|BULK|CLASSROOM|  │
              │                            PURCHASE|SYSTEM        │
              │ status        varchar(8)  ACTIVE|REVOKED|EXPIRED  │
              │ granted_by_id FK users.User NULL (SET_NULL)       │
              │ expires_at    timestamptz NULL                    │
              │ created_at    timestamptz                         │
              │ updated_at    timestamptz                         │
              └───────────────────────┬──────────────────────────┘
                                      │ 1..*  (append-only)
              ┌───────────────────────▼──────────────────────────┐
              │             AccessGrantEvent                      │
              │  (table: access_grant_events)                     │
              ├──────────────────────────────────────────────────┤
              │ id          BIGSERIAL PK                          │
              │ grant_id    FK ResourceAccessGrant (CASCADE)      │
              │ action      varchar(12) GRANTED|REVOKED|EXPIRED|  │
              │                          EXTENDED|RESTORED|        │
              │                          BACKFILLED                │
              │ actor_id    FK users.User NULL (SET_NULL)         │
              │ snapshot    jsonb   (grant fields at event time)  │
              │ note        text                                  │
              │ created_at  timestamptz                           │
              └──────────────────────────────────────────────────┘

resource_type/resource_id is a *logical* polymorphic FK resolved via
access/resources.py registry → {practice_test, mock_exam, pastpaper_pack,
practice_test_pack, assessment_set, module, ...}. No DB-level FK (resources
live in different apps); referential integrity enforced at service layer +
validation, with cascade cleanup via a post_delete hook per registered type.
```

## Constraints

**Scope shape (CheckConstraint):**
- `scope='SUBJECT'` ⇒ `subject IS NOT NULL AND resource_type IS NULL AND resource_id IS NULL`
- `scope='RESOURCE'` ⇒ `resource_type IS NOT NULL AND resource_id IS NOT NULL AND subject IS NULL`

**Duplicate prevention (partial unique — only one ACTIVE grant per logical target):**
- SUBJECT, classroom NULL: `unique(user, subject) where status='ACTIVE' and scope='SUBJECT' and classroom_id is null`
- SUBJECT, classroom set: `unique(user, subject, classroom) where status='ACTIVE' and scope='SUBJECT' and classroom_id is not null`
- RESOURCE, classroom NULL: `unique(user, resource_type, resource_id) where status='ACTIVE' and scope='RESOURCE' and classroom_id is null`
- RESOURCE, classroom set: `unique(user, resource_type, resource_id, classroom) where status='ACTIVE' and scope='RESOURCE' and classroom_id is not null`

(Two constraints per scope because Postgres treats NULL as distinct in unique indexes; splitting on `classroom_id IS [NOT] NULL` makes dedup exact. Supported on Postgres 16 and SQLite 3.x via Django 6 `UniqueConstraint(condition=...)`.)

## Indexes

- `(user_id, status, scope)` — primary visibility prefix.
- `(user_id, status, scope, resource_type, resource_id)` — resource visibility lookup.
- `(user_id, status, scope, subject, classroom_id)` — subject visibility lookup.
- `(resource_type, resource_id, status)` — "who can access resource X" admin/reverse lookup.
- `(status, expires_at)` — expiry sweep.
- `(classroom_id, status)` — classroom revocation.
- `AccessGrantEvent(grant_id, created_at)`, `(action, created_at)`.

## Mapping legacy → new (for backfill)

| Legacy source | New grant |
|---------------|-----------|
| `access.UserAccess(user, subject=math/english, classroom=NULL)` | SUBJECT grant, `subject`, `classroom=NULL`, `source=MANUAL` (or CLASSROOM if it carried classroom), `granted_by` preserved |
| `access.UserAccess(..., classroom=X)` | SUBJECT grant scoped to classroom X, `source=CLASSROOM` |
| `PracticeTest.assigned_users` M2M | RESOURCE grant `practice_test`, `source=BULK` |
| `MockExam.assigned_users` M2M | RESOURCE grant `mock_exam`, `source=BULK` |
| `PortalMockExam.assigned_users` M2M | RESOURCE grant `mock_exam` (canonicalized to underlying mock) |
| `classes.Assignment` targets | RESOURCE grants per target type, `source=CLASSROOM`, `classroom` set |

All backfilled rows get an `AccessGrantEvent(action=BACKFILLED)`.
