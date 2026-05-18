# ADR-002: SQLite session_memory table (Phase 2)

**Status:** Accepted

## Context

The markdown memory file from ADR-001 is agent-readable but not queryable. As session history grows, we need structured queries: "which sessions touched this project?", "what was the total cost last week?", "which agent was used most?".

## Decision

Add a `session_memory` table to the main openloom.db SQLite database. On session close, write to both the markdown file (for agent readability) and the SQLite row (for structured queries). The SQLite write looks up cost/agent/model from the existing `session` table row.

Schema: `session_id`, `date`, `title`, `agent`, `model_id`, `cost_usd`, `cwd`, `slate_tasks` (JSON), `time_created`, `time_updated`.

## Rationale

- The main openloom.db already exists and is managed by Drizzle — no new infrastructure
- The session table already has cost, agent, and model fields — we just denormalize them for quick lookup
- Not FK-constrained so memory survives session deletion
- Both writes are non-fatal — the session close never fails due to memory write errors

## Consequences

**Easier:** Future TUI history view, cost analytics, per-agent reporting.

**Harder:** One more table to maintain. Migration required.
