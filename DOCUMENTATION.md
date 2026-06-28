# Documentation-Driven Development Framework

This document is a portable framework for building software projects where documentation is written before code, not after it. It was developed through the Watch project and is designed to be copied into any new project as a starting point.

---

## The core principle

**Write the doc before the code.**

Docs written after the fact describe what was built. Docs written first force you to think through the design before you are committed to an implementation. The friction of writing the doc *is* the design review.

If you cannot write the doc, you do not understand the design yet. Writing it first surfaces that before you have committed weeks of code to a misunderstanding.

---

## The five layers

Every project needs five types of documentation, introduced in a specific order. Each layer depends on the one before it.

---

### Layer 1 — Foundation

**When:** Before any code is written.

**Purpose:** Settle the "what and why" before anything else.

| File | One job |
|---|---|
| `README.md` | 5-minute orientation: what it is, how to run it locally, where to go next |
| `docs/prd.md` | Problem, users, v1 scope, non-goals, and success criteria |
| `docs/roadmap.md` | Milestones with clear, bounded scope — what is in each, what is deferred |
| `docs/glossary.md` | The shared vocabulary: every domain concept, one authoritative definition |
| `docs/architecture.md` | How the pieces fit together, request flow, technology choices, scale target |

**Start with the glossary.** Naming is the hardest problem in software. If two people mean different things by the same word, every design conversation goes sideways. Write the glossary on day one, even if it only has five entries, and grow it as the domain becomes clearer.

**Example — glossary entry from Watch:**

```markdown
## Ingestion key

A project- and environment-scoped public client identifier safe to embed in
frontend code. It authorizes the SDK to send events to the ingestion API but
does not grant any dashboard access. Keys support rotation, revocation, rate
limits, and origin allowlists.
```

This is one paragraph. It names the concept, describes what it is, says what it does and does not allow, and lists its properties. Everything in the codebase and in other docs refers to "ingestion key" — not "API key", "project key", "SDK key", or "token".

**Example — PRD success criteria from Watch:**

```markdown
## Success Criteria

- A fresh server can run Watch with `docker compose up -d`.
- The browser SDK reports Web Vitals and JavaScript errors.
- The dashboard shows useful frontend production data within 1-2 minutes.
- Sensitive data is not stored by default.
- A developer can identify a bad frontend release from the dashboard.
```

Success criteria are the most important part of a PRD. They are binary: either you can verify them or you cannot. Avoid vague criteria like "the system is fast" or "users find it useful." Write something you can actually test.

---

### Layer 2 — Design

**When:** Before each milestone or significant feature.

**Purpose:** Settle the "how does this specific thing work" before implementing it.

| File | One job |
|---|---|
| `docs/architecture.md` | Updated per milestone with new components, data flows, and decisions |
| `docs/data-modeling-*.md` | Schema decisions, constraints, and why things are shaped a certain way |
| `docs/event-taxonomy.md` | The canonical shape of every message, event, or payload that crosses a boundary |
| `docs/auth-model.md` | Auth and trust boundary decisions — who is allowed to do what and why |
| `docs/how-it-works.md` | End-to-end mental model: what happens when X occurs, step by step |

**Example — data modeling decision from Watch:**

```markdown
## Why rollups instead of querying raw events

Raw events are append-only and grow without bound. Querying them for a 7-day
chart over millions of events is slow and gets worse over time. The worker
aggregates raw events into hourly rollup buckets — one row per
(project, environment, route, metric, hour) — so dashboard queries scan
a small, bounded table regardless of event volume.

The tradeoff: rollups are pre-computed for common queries but cannot answer
ad-hoc questions about individual events. Raw events are retained separately
for sample inspection and are deleted after the retention window.
```

This explains what was decided, why, and what the tradeoff is. A developer reading this six months later understands the design without having to reverse-engineer it from the schema.

**Example — event taxonomy entry from Watch:**

```markdown
### `network_request`

Captures frontend-observed network failures.

Includes:
- URL (query params with sensitive keys redacted)
- Method (uppercase HTTP method)
- Status code (absent when the request never received a response)
- Duration in ms
- Failure reason: `network_error` or `non_ok_status`
```

Every field is named, every absence is explained, and the shape is stable — the SDK, the ingest handler, and the worker all reference this doc as the source of truth.

---

### Layer 3 — Operations

**When:** Before production, or before anything handles real user data.

**Purpose:** Document the security posture, data lifecycle, and operator responsibilities explicitly.

| File | One job |
|---|---|
| `docs/threat-model.md` | What you defend against, what you do not, what operators must compensate for |
| `docs/security-hardening.md` | Operator checklist: built-ins vs operator responsibility vs known gaps |
| `docs/storage-retention.md` | What data is kept, for how long, and how to delete it |

**The threat model pattern.** For each threat, write three things: what the system provides, what it does not protect against, and what the compensating control is. No hedging.

```markdown
## Login brute force

- **Mitigation provided**: per-account lockout after 5 failed attempts within
  15 minutes; Argon2id's ~100ms cost; vague errors prevent enumeration.
- **Not protected**: distributed guessing across many accounts, per-IP abuse
  (the BFF hides client IPs from the Go server).
- **Compensating control**: add per-IP throttling at the reverse proxy or WAF.
```

A documented gap is a decision. An undocumented gap is a surprise. Surprises in production are expensive.

**The `[built-in]` / `[operator]` / `[gap]` tagging pattern** used in the security hardening guide:

```markdown
- **[built-in]** Passwords are hashed with Argon2id.
- **[operator]** Terminate HTTPS in front of everything — Watch does not handle TLS.
- **[gap]** MFA is not implemented in v1. Compensate with an authenticating reverse
  proxy, VPN, or IP allowlists.
```

This makes responsibilities unambiguous. Anyone reading the doc knows exactly what Watch does for them and what they must do themselves.

---

### Layer 4 — Collaboration

**When:** Before adding contributors, or before relying on an AI coding assistant.

**Purpose:** Document how to work in the repo, not just what the repo does.

| File | One job |
|---|---|
| `CONTRIBUTING.md` | Branching, commit style, PR process, how to run the project locally |
| `AGENTS.md` | Engineering standards, testing expectations, dependency discipline — for AI and human contributors alike |
| `docs/milestone-N/` | Per-milestone walkthroughs that record decisions while they are fresh |

**The `AGENTS.md` trick.** Writing instructions for an AI collaborator forces you to be explicit about things you would normally leave implicit. The result is also the best onboarding doc a new human contributor could read.

Bad:
```markdown
Write good tests.
```

Good:
```markdown
## Testing expectations

- Unit test pure logic, validation, and configuration parsing.
- Integration test database repositories and auth/session behavior — do not mock
  the database. We were burned when mocked tests passed but a real migration failed.
- Privacy test SDK defaults so cookies, storage, and form fields are not collected
  by default.
- Regression test every bug fix before changing the implementation.
```

The "why" is in the doc. A new engineer reads this and understands not just the rule but the incident that created it.

**Example — per-milestone walkthrough structure (`docs/milestone-1/README.md`):**

```markdown
# Milestone 1: Ingestion Spine

## What we built
- Go server, Postgres schema, foundational tables
- Project-scoped browser ingestion keys
- Raw event storage with schema validation

## Key decisions
- Why we used pgx instead of database/sql: ...
- Why ingestion keys are separate from user sessions: ...
- Why dropped events get their own counter table: ...

## What we deferred and why
- Rate limiting deferred to Milestone 2 — wanted end-to-end first
- Key rotation UI deferred to Milestone 6 (Dashboard)

## Things we would do differently
- The `raw_events.payload` JSONB column works but querying nested fields
  in SQL is verbose. Consider a hybrid schema in a future pass.
```

Write this while the decisions are fresh, not six months later. It is the documentation a future contributor (or future you) will actually read.

---

### Layer 5 — Living docs

**When:** Continuously, triggered by behavior changes.

**Purpose:** Keep docs accurate as the project evolves.

| Trigger | Update |
|---|---|
| New API field or event type | `event-taxonomy.md` or equivalent |
| Schema change | `data-modeling.md`, migration notes |
| New operator configuration | `README.md` and `security-hardening.md` checklist |
| Threat surface change | `threat-model.md` |
| Milestone complete | `roadmap.md` (mark done), write the walkthrough |
| Breaking change | Upgrade guide in `docs/` |

**The enforcement rule:** Any PR that changes behavior without updating the relevant doc does not merge. Put this in `AGENTS.md` so an AI collaborator enforces it automatically, and in `CONTRIBUTING.md` as a code review checklist item.

```markdown
## Before considering work done

- Does the change alter product behavior, architecture, setup, configuration,
  data shape, or operational expectations?
- If yes: update the relevant doc in the same PR.
- A behavior change with no doc update is an incomplete PR.
```

---

## The process per milestone

Follow this sequence for each milestone or major feature. Steps 1–3 are docs. Step 4 is tests. Step 5 is code. Steps 6–8 are docs again.

```
1. Write the milestone scope into roadmap.md
2. Write or update the relevant design doc
   (data model, event shape, API contract, auth boundary)
3. Add glossary entries for any new domain concepts
4. Write failing tests that describe the expected behavior
5. Implement until tests pass
6. Update security-hardening.md if the threat surface changed
7. Write the milestone walkthrough while decisions are fresh
8. Update README.md if setup or configuration changed
```

If you cannot write step 2, go back to step 1. The scope is not clear enough yet.

---

## Starter file checklist for a new project

Copy this into a new project and fill it in before writing any code:

```
docs/
  prd.md              ← problem, users, v1 scope, non-goals, success criteria
  roadmap.md          ← milestones with scope
  architecture.md     ← components, request flow, technology choices
  glossary.md         ← shared vocabulary
  how-it-works.md     ← end-to-end mental model
  auth-model.md       ← trust boundaries and auth design
  threat-model.md     ← what you defend against and what you do not
  security-hardening.md ← operator checklist
  data-modeling.md    ← schema decisions and tradeoffs
  event-taxonomy.md   ← payload shapes for every boundary crossing (if applicable)

README.md             ← 5-minute orientation
CONTRIBUTING.md       ← how to work in the repo
AGENTS.md             ← engineering standards (for AI and human contributors)
```

You will not fill all of these before writing the first line of code. But you should have `prd.md`, `roadmap.md`, `architecture.md`, and `glossary.md` before the first commit to main.

---

## The three habits that make it stick

**1. Short docs beat comprehensive docs.**

A 200-line doc that gets read and updated beats a 2,000-line doc that gets ignored. Each doc has one job. When it tries to do two, split it. A doc that is too long to read is not documentation — it is archaeology.

**2. Docs live in the repo, not in a wiki.**

Wikis drift from code. When docs are in the repo, they update in the same PR. A doc that can go stale without a failing review is a doc that will go stale. Notion pages, Confluence articles, and Google Docs all rot. Markdown files checked into git do not — at least not without someone actively choosing to break them.

**3. Document the gaps explicitly.**

Every system has things it does not do. Document them with the compensating control.

```markdown
## [gap] MFA is not implemented in v1.

Compensate with an authenticating reverse proxy (oauth2-proxy, Cloudflare Access),
VPN, or IP allowlists. The user model accepts OIDC and trusted-header auth as
future additions — this gap is designed to close, not to stay.
```

An acknowledged gap is a decision. An unacknowledged gap is a liability. Teams that document their gaps make better tradeoff decisions, have better security postures, and onboard new contributors faster because the map of "things we know are incomplete" is explicit rather than tribal knowledge.

---

## Adapting this framework

This framework is not prescriptive about tooling. It works with any language, framework, or deployment model. The only non-negotiable is the sequence: foundation before design, design before code, code before production, and living docs maintained continuously.

Scale the depth to the project:

| Project size | Minimum docs |
|---|---|
| Solo weekend project | README, one-page architecture note, glossary |
| Small team, internal tool | All of Layer 1 + threat model + CONTRIBUTING |
| Production system with users | All five layers, full checklist |
| Regulated environment (finance, health) | All five layers + audit trail doc + compliance mapping |

The framework is most valuable when it feels like overhead — that friction is the signal that a design decision has not been thought through yet. Push through it. The doc is the design.
