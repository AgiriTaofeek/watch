# Data Modeling Framework

A reusable, project-agnostic process for deciding **what tables to create** when starting a new project or feature. Use this whenever you face the question "what does the database look like?" — Watch or anywhere else.

This document captures a six-step framework, heuristics for the calls that trip people up, common patterns, anti-patterns, and a worked example. The last section is a single-page checklist you can run through every time.

For the Watch-specific application of this framework, see the [Milestone 1 reference doc](milestone-1/README.md).

## How To Use This Framework

Apply it whenever you face:

- A new project with no existing schema.
- A new feature in an existing project that needs new tables.
- A refactor where the current model is starting to hurt.

Do **not** apply it when:

- You're adding a single column to an existing table. That's a one-line migration, not a modeling exercise.
- You're optimising an existing model that already works. The framework is for *design*, not for *tuning*.

Read top to bottom on your first pass. After that, sections 9 (checklist) and 4 (heuristics) are the two you'll come back to.

## 1. Vocabulary

These terms appear throughout. Skip if familiar.

- **Entity** — a thing the system stores. Becomes a table.
- **Relationship** — how two entities reference each other (one-to-many, many-to-many, etc.).
- **Cardinality** — how many of A correspond to how many of B (one-to-one, one-to-many, many-to-many).
- **Primary key** — the column that uniquely identifies a row, usually `id`.
- **Foreign key** — a column on a child table whose value must match a primary key in the parent table.
- **Normalization** — store each fact in exactly one place. Reduces redundancy.
- **Denormalization** — deliberately duplicate a fact across tables to make a hot read fast.
- **Migration** — a versioned SQL file checked into git that evolves the schema.
- **Schema debt** — the cost of carrying a table or column that no longer fits the current shape of the system.

## 2. The Starting Principle

**Data model is the highest-leverage decision you make.** Code is easy to change; schemas are hard. A bad schema makes every feature on top of it harder, forever.

So you spend disproportionate time here, and you do it deliberately. **There is no clever shortcut.** The process is boring on purpose — boring is what makes it work.

## 3. The Six-Step Process

Apply these in order. Each step has a goal, a procedure, and a concrete example using a hypothetical blog application (`posts`, `users`, `comments`, `tags`). The Watch worked example appears later in [§7](#7-worked-example-applying-the-framework-to-watch-m1).

### Step 1 — Surface the behaviors

**What to do:** read the requirements (PRD, roadmap, ticket, whatever you have). Write down what the **system does**, expressed as verbs. Not screens. Not "there will be a settings page" — that's a UI concept. Behaviors.

**Why:** behaviors are the source of truth. Screens, APIs, and tables are all downstream of behaviors. Starting from screens leads to UI-shaped tables that fall apart when you add a second screen.

**Example (blog app):**
- Users can sign up and log in.
- Users can publish posts with a title and body.
- Users can comment on posts.
- Posts can be tagged.
- Anyone can read published posts.
- Authors can edit or delete their own posts.

Six behaviors. Notice that none of them say "there's a settings page" or "the home page shows recent posts." Those are presentation decisions that come later.

### Step 2 — Extract the nouns

**What to do:** for each behavior, ask: **what is being acted on?** The nouns become candidate tables.

**Why:** every table is a noun. Verbs become queries or endpoints. If you find yourself naming a table `create_post` or `process_signup`, you've confused a behavior for an entity.

**Example (blog app):**

| Behavior | Nouns |
| --- | --- |
| Sign up + log in | **users**, sessions |
| Publish posts | **posts**, users |
| Comment on posts | **comments**, posts, users |
| Tag posts | **tags**, posts |
| Read published posts | posts |
| Edit/delete own posts | posts |

Deduplicate → candidate tables: `users`, `sessions`, `posts`, `comments`, `tags`.

Five tables. Each one is a thing the system *stores*. None of them is a verb.

### Step 3 — Map "belongs-to" relationships

**What to do:** for every pair of nouns, ask "**does one belong to the other?**" If yes, the child gets a foreign key column pointing at the parent.

**Why:** databases enforce relationships through foreign keys. They prevent orphans (a `comment.post_id` that points at a nonexistent post). The constraint catches bugs before they corrupt your data.

**The direction matters:** the FK lives on the child — the *belongs-to* side. The child knows about exactly one parent. The parent might have zero or many children, and you can't store a list of unbounded children in a single column.

**Example (blog app):**

```
posts.author_id        → users.id      (a post belongs to a user)
comments.post_id       → posts.id      (a comment belongs to a post)
comments.author_id     → users.id      (a comment belongs to a user)
sessions.user_id       → users.id      (a session belongs to a user)
```

For tags, it's many-to-many — a post can have many tags; a tag can be on many posts. That gets a **join table**:

```
post_tags.post_id      → posts.id
post_tags.tag_id       → tags.id
PRIMARY KEY (post_id, tag_id)
```

The join table holds the pairs. It has no `id` of its own; the pair is the identity.

### Step 4 — Walk the flows

**What to do:** pick two or three representative user actions (or system events) and trace them through your candidate tables. **If a walk feels clunky, the model is wrong.**

**Why:** this is the verification step. Most modeling mistakes show up as awkward joins or missing tables when you try to satisfy a real request.

**Example (blog app):**

*Flow A: "Show me the home page with the 10 most recent posts and their authors."*
```
SELECT posts.*, users.display_name
FROM posts
JOIN users ON posts.author_id = users.id
WHERE posts.published_at IS NOT NULL
ORDER BY posts.published_at DESC
LIMIT 10;
```
One join. Clean.

*Flow B: "Show all comments on a post, with the commenter's name."*
```
SELECT comments.*, users.display_name
FROM comments
JOIN users ON comments.author_id = users.id
WHERE comments.post_id = $1
ORDER BY comments.created_at ASC;
```
One join. Clean.

*Flow C: "Show all posts tagged 'rust', most recent first."*
```
SELECT posts.*
FROM posts
JOIN post_tags ON post_tags.post_id = posts.id
JOIN tags ON tags.id = post_tags.tag_id
WHERE tags.name = 'rust'
ORDER BY posts.published_at DESC;
```
Two joins. Still clean.

If any walk had felt awkward — say, "to know if a user can edit a post, we have to join through three tables" — that would be a signal to revisit. Either I missed a noun, or I drew a relationship in the wrong direction.

### Step 5 — Demote to columns where possible

**What to do:** look at each candidate table and ask: **does it really deserve to be a table, or could it be a column?**

**The three-test heuristic:** a thing is a table when it has at least **two of these three**:

1. **Its own identity** — an `id` worth referring to from elsewhere.
2. **Its own lifecycle** — can exist before/after its parent, or changes independently.
3. **Many-cardinality** — there are usually many of them per parent.

Otherwise, it's a column, enum, or JSON field.

**Examples:**

- **User role** in a blog: three fixed values (`reader`, `author`, `admin`). Doesn't have its own identity (no row points at "the reader role"), doesn't have its own lifecycle. → **Column with enum**, not a table.
- **User profile** (display name, bio, avatar URL): one per user, lives and dies with the user. → **Columns on `users`**, not a separate table.
- **User session**: has its own identity, its own expiry (lifecycle), many sessions per user. → **Separate table.**
- **Post visibility** (`public`, `private`, `unlisted`): three fixed values. → **Column.**
- **Post tags**: independent identity (`tags.id` is referenced from `post_tags`), independent lifecycle (a tag exists without any posts), many-cardinality. → **Separate table.**

### Step 6 — Reserve future-proofing fields only for documented needs

**What to do:** add columns now only if a known-future feature requires them, and that future feature is documented somewhere durable (PRD, roadmap, design doc).

**Why:** speculative breadth is the leading cause of schema debt. Every column you add is a thing you maintain, migrate, document, and explain. "Maybe we'll need it" never pays off; "the roadmap says M5 adds X" does.

**Example (blog app):**

| Field | Add now? | Why |
| --- | --- | --- |
| `users.external_subject_id` | If SSO is on the roadmap | Yes — documented future need |
| `posts.translated_versions` | "Maybe we'll add i18n" | No — speculative |
| `posts.deleted_at` | If soft-delete is on the roadmap | Yes |
| `posts.view_count_estimate` | "Maybe analytics later" | No |

When in doubt: **leave it out**. Adding a column later via migration is cheap. Carrying an unused column for years is not.

## 4. Heuristics For Hard Decisions

These are the calls that catch beginners. Each has a clear default plus the situation that overrides it.

### Is it a table or a column?

**Default:** column.
**Promote to table when:** it passes 2 of 3 — own identity, own lifecycle, many-cardinality.

If you're unsure, write the SQL for the most common query against it. If the query treats the value as opaque (just reads or compares), it's a column. If the query joins to it or aggregates over it, it's probably a table.

### Normalize or denormalize?

**Default:** normalize. Store every fact in exactly one place.
**Denormalize when:** a specific read path is hot enough that the join cost matters, AND you can document the redundancy at the column level.

Denormalization examples:

- A high-volume `events` table copies `project_id` from its parent `ingestion_key` to avoid joining on every query.
- An `orders` table copies the `customer_email` at the time of purchase, because the customer might later change their email and you want the historical value.

If you do denormalize, **comment in the migration** explaining why. Future maintainers need to know it's deliberate.

### Hard delete or soft delete?

**Default:** soft delete for anything a user might want to recover, audit, or reference historically. Hard delete for noise.

- **Soft delete (use `deleted_at` timestamp):** posts, comments, projects, accounts, anything user-facing.
- **Hard delete:** sessions, expired tokens, counter snapshots, cache entries, debug logs.

Soft-delete tables need a `WHERE deleted_at IS NULL` filter in every standard query, plus a partial unique index if you have a uniqueness constraint that shouldn't apply to deleted rows.

### Reserve a future column now?

**Default:** no.
**Yes when:** the future need appears in a durable document (PRD, roadmap, design doc) — not just in a conversation.

If the future need is "real but not yet specified," wait. A migration is cheaper than a column whose meaning is ambiguous.

### Should this be in this service or a new one?

**Default:** same service, same database.
**Split when:** different scaling characteristics (e.g. an analytics workload that doesn't fit your OLTP DB) **AND** you've felt the pain in production.

Premature service splits create more problems than they solve. Watch's M1 puts ingestion, dashboard, worker, and alerts in one Go process for exactly this reason.

## 5. Patterns You'll Reuse

A catalogue of shapes that recur. Recognising them speeds up modeling enormously — most "new" schemas are just combinations of these patterns.

### Has-many

The most common shape. Parent → many children. FK on the child.

```
users (id, ...)
posts (id, author_id REFERENCES users(id), ...)
```

### Many-to-many

Two entities, either can have many of the other. Join table holds the pairs.

```
posts (id, ...)
tags (id, name, ...)
post_tags (
  post_id REFERENCES posts(id),
  tag_id REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
)
```

### Rotation (versions over time)

Instead of overwriting an old value, mark the old row inactive and create a new one. Enables auditing ("when did this change?") and rollback.

```
api_keys (
  id, owner_id,
  key_value,
  created_at,
  revoked_at  -- NULL while active
)
```

The currently-active key is the one with `revoked_at IS NULL`.

### Counters / aggregates

When you only care about counts, don't store every event. Group by `(scope, reason, time_bucket)` and increment atomically.

```
dropped_events (
  scope_id, reason, day,
  count BIGINT NOT NULL,
  PRIMARY KEY (scope_id, reason, day)
)

INSERT INTO dropped_events (scope_id, reason, day, count)
VALUES ($1, $2, current_date, 1)
ON CONFLICT (scope_id, reason, day)
DO UPDATE SET count = dropped_events.count + 1;
```

Postgres handles concurrent increments atomically.

### Soft delete

Add `deleted_at TIMESTAMPTZ NULL` to any table where users might want to recover or where you want audit trail. Every standard query filters `WHERE deleted_at IS NULL`.

```
posts (id, ..., deleted_at TIMESTAMPTZ NULL)

SELECT * FROM posts WHERE deleted_at IS NULL AND id = $1;
```

### Per-tenant scoping

Even if v1 is single-tenant, add a `tenant_id` / `organization_id` to every table from day one. Adding it later requires backfilling every row.

```
organizations (id, name, ...)
users (id, organization_id REFERENCES organizations(id), ...)
projects (id, organization_id REFERENCES organizations(id), ...)
```

### Denormalize for hot reads

Copy a parent's key into a high-volume child table to avoid joins. Comment the redundancy.

```
events (
  id,
  ingestion_key_id REFERENCES ingestion_keys(id),
  project_id REFERENCES projects(id),  -- denormalized from ingestion_keys for fast filtering
  ...
)
```

### Outbox (preview for later projects)

When you need to publish an event to an external system reliably, write to an `outbox` table in the **same transaction** as the business change. A worker reads the outbox and dispatches.

```
BEGIN;
  INSERT INTO orders (...);
  INSERT INTO outbox (event_type, payload) VALUES ('order_placed', $1);
COMMIT;
-- A separate worker polls outbox and delivers, then deletes the row.
```

This guarantees the side effect happens if and only if the business change committed. Used by every system that needs reliable async fan-out.

## 6. Anti-Patterns To Avoid

The mistakes that ruin schemas. Recognise them before you ship them.

### Modeling the UI

The schema does not have to match what one page displays. Two different screens can read the same tables in different shapes. If you find yourself building `home_page_data` or `user_dashboard_table`, you're modeling the UI. Stop.

### Verbs as tables

Tables are nouns. `create_user`, `process_event`, `send_notification` — these aren't entities. The verb is a function or endpoint that operates on existing tables.

**Test:** can you say "a $TABLE"? "A users" — yes. "A create_user" — no.

(Exception: nouns that look like verbs, e.g. `logins` meaning "the record of a login attempt", are fine. A `logins` table is grammatically a noun.)

### Speculative breadth

"Maybe we'll need internationalization. Maybe we'll need multi-currency. Maybe we'll need an audit log." Resist. Wait for the requirement. Premature breadth creates columns that are never filled, queries that have to be aware of cases that never happen, and migrations that maintain things nobody uses.

### Wide tables

A table with 50+ columns is usually three tables wearing a trench coat. When you see a wide table, look for clusters of columns that change together — those clusters often belong in their own table.

**Example smell:** `users` has 80 columns including billing fields, profile fields, notification preferences, OAuth tokens, and session data. Split into `users`, `user_profiles`, `user_billing`, `user_oauth`, `sessions`.

### Never iterating

The first migration is not final. Schemas evolve through migrations. Senior backend engineers don't try to design the perfect schema in advance — they design something good enough to start and evolve it. The skill is **bendability**, not perfection.

### Avoiding foreign keys "for performance"

Foreign-key constraints have negligible performance cost on writes (a single index lookup) and catch entire classes of bugs at the database level. Use them. The performance argument almost never holds up in practice.

### Storing lists in a single column

A column with a comma-separated list of values is a red flag. You can't query it efficiently, you can't enforce uniqueness, you can't reference items from elsewhere. Use a child table (has-many) or a join table (many-to-many).

**Exception:** JSON arrays in Postgres `jsonb` columns are fine when the contents are truly opaque — a payload you store and return verbatim without ever querying inside.

## 7. Worked Example: Applying The Framework To Watch M1

Real walkthrough. Watch's Milestone 1 deliverables (from [docs/roadmap.md](roadmap.md)):

> - Go server app
> - Postgres schema
> - Project and environment model
> - Project-scoped browser ingestion keys
> - Strict event validation
> - Raw event storage
> - Dropped-event counters
> - Local user accounts
> - Password hashing (Argon2id)
> - Secure session cookies
> - Roles: `owner`, `admin`, `member`, `viewer`
> - Docker Compose setup

### Step 1 — Surface the behaviors

Pulled from the roadmap:

1. Accept events from browser SDKs via a project-scoped key.
2. Validate events, drop invalid ones, **count the drops**.
3. Store accepted events verbatim.
4. Let humans log in to manage projects, environments, and keys.
5. Enforce role-based permissions.

### Step 2 — Extract the nouns

| Behavior | Nouns |
| --- | --- |
| Accept events with project-scoped key | **events**, **keys**, **projects** |
| Drop invalid events, count drops | **dropped event counters** |
| Store accepted events | **events** (raw) |
| Humans log in | **users** (and later, sessions) |
| Manage projects, environments, keys | **projects**, **environments**, **keys** |
| Enforce roles | (role is per-user — could be a column, see step 5) |
| Single org per deployment (from `docs/architecture.md`) | **organizations** |

Deduplicate → 7 candidate tables: `organizations`, `users`, `projects`, `environments`, `ingestion_keys`, `raw_events`, `dropped_event_counters`.

### Step 3 — Map "belongs-to" relationships

```
users.organization_id          → organizations.id
projects.organization_id       → organizations.id
environments.project_id        → projects.id
ingestion_keys.environment_id  → environments.id
raw_events.ingestion_key_id    → ingestion_keys.id
dropped_event_counters.environment_id → environments.id (nullable; unknown keys
                                          have no environment yet)
```

### Step 4 — Walk the flows

**Ingestion flow:**
```
Find ingestion_keys WHERE public_key = $key
  → get environment_id
  → JOIN environments → get project_id
  → JOIN projects → get organization_id
  → INSERT INTO raw_events (ingestion_key_id, environment_id, project_id, ...)
```
Four lookups, no detours. Clean.

**Dashboard "list my projects":**
```
Resolve user_id from session cookie
  → users.organization_id
  → SELECT * FROM projects WHERE organization_id = $org
  → For each project: SELECT environments, keys
```
Clean.

Both walks support the behavior. Model holds.

### Step 5 — Demote to columns where possible

- **Roles** — four fixed values (`owner`, `admin`, `member`, `viewer`). No identity, no lifecycle. → **Column with enum on `users`**, not a separate table.
- **Origin allowlist** — currently zero documented need for tracking changes over time. → **Column on `projects`** (array or comma-separated). Promote later if we need audit.
- **Display name / email on users** — one per user, lives and dies with the user. → **Columns on `users`**, not a profile table.

The 7 candidate tables survive. Roles get folded into a column.

### Step 6 — Future-proofing

From [docs/auth-model.md](auth-model.md), OIDC and trusted-header auth are documented future modes. So `users` gets:

- `auth_provider` (column, defaults `"local"`)
- `external_subject_id` (column, nullable)

That's the only forward-looking addition. Sessions, CSRF tokens, OAuth flows — all deferred to when their tasks land.

### Resulting schema (sketch)

```
organizations(id, name, created_at)
users(id, organization_id FK, email, password_hash, display_name,
      role ENUM, auth_provider, external_subject_id, created_at, last_login_at)
projects(id, organization_id FK, name, slug, created_at, updated_at)
environments(id, project_id FK, name, created_at)
ingestion_keys(id, environment_id FK, public_key UNIQUE INDEXED,
               created_at, revoked_at NULL)
raw_events(id, ingestion_key_id FK, environment_id FK, project_id FK,
           event_type, release, event_timestamp, received_at, payload jsonb)
dropped_event_counters(id, environment_id FK NULL, reason ENUM, day,
                       count BIGINT, UNIQUE (environment_id, reason, day))
```

The framework produced exactly the seven tables documented in [docs/milestone-1/README.md](milestone-1/README.md) §4 — not because they were known in advance, but because the process arrives there.

## 8. When To Revisit Your Model

The schema isn't fixed. Watch for these triggers — they signal "time for a migration":

- **A new feature can't be expressed without ugly joins.** Five-way joins to answer a basic question usually mean a missing table or a missing column.
- **A query is slow and adding an index doesn't fix it.** Often the table shape is wrong (too narrow, too wide, missing a denormalized column).
- **You're tempted to store a list in a single column.** Convert to a child or join table.
- **You're tempted to add a column whose meaning changes per row.** That's a sign you actually need a sibling table or a discriminated union.
- **You discover a missing concept during implementation.** Don't squeeze it into an existing column. Write a migration; add the table or column properly.
- **A column's nullability becomes a constant source of bugs.** Often means there are actually two cases that should live in two tables, or one case where the column should be required.

Each trigger is a prompt to **write a migration**, not a sign that you "got it wrong." Schemas evolve. The first 0001 migration is not the last.

## 9. Quick-Reference Checklist

Print this. Run it at the start of every new feature or project.

```
DESIGN

[ ] Listed all the behaviors the feature must support.
    (Verbs, not screens. Pull from PRD / roadmap / ticket.)

[ ] Extracted nouns from those behaviors.
    (Each noun is a candidate table.)

[ ] Established belongs-to relationships.
    (FK on the child. Many-to-many → join table.)

[ ] Walked at least 2 representative flows through the candidate tables.
    (Trace SELECTs and INSERTs. Clunky walks → revise the model.)

[ ] Demoted concepts to columns where the 3-test fails.
    (Identity + lifecycle + many-cardinality. Pass 2/3 → table.)

[ ] Added only documented future-proofing fields.
    (No speculation. Roadmap-backed only.)

HEURISTICS APPLIED

[ ] Normalize by default. Documented any denormalization.
[ ] Soft delete for user-facing things. Hard delete for noise.
[ ] Per-tenant scoping included from day 1.

PATTERNS USED

[ ] _________________________________
[ ] _________________________________

ANTI-PATTERNS CHECKED

[ ] Not modeling the UI.
[ ] No verbs as table names.
[ ] No table with 50+ columns.
[ ] Foreign keys are present, not skipped "for performance".
[ ] No lists stored in a single column (jsonb of opaque data is fine).

MIGRATION

[ ] First up.sql drafted.
[ ] First down.sql written (and tested if possible).
[ ] Migration runs cleanly on an empty database.
[ ] Migration runs cleanly on a database with previous migrations applied.
```

## 10. Further Reading

- *Database Design for Mere Mortals* — Hernandez. The gold-standard practical book. Skip the dated parts; the conceptual chapters are timeless.
- *Designing Data-Intensive Applications* — Kleppmann. More advanced. Chapter 2 on data models is essential.
- Postgres data definition: <https://www.postgresql.org/docs/current/ddl.html>.
- Use The Index, Luke: <https://use-the-index-luke.com/>. SQL performance and indexing.
- A worked Watch-specific example: [Milestone 1 reference doc](milestone-1/README.md).
- The Watch glossary (project, environment, release, etc.): [glossary.md](glossary.md).
- The Watch monorepo concepts (tooling around the data layer): [monorepo-concepts.md](monorepo-concepts.md).
