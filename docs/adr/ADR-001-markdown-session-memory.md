# ADR-001: Markdown files for session memory (Phase 1)

**Status:** Accepted (Phase 2 extends this — see ADR-002)

## Context

Agents need persistent memory of past sessions — what was worked on, what was completed — to pick up context across conversations. The question is how to store and expose this.

## Decision

Phase 1: write a one-liner markdown table row to `~/.agents/memory/progress.md` on every session close. If a project-local `.agents/memory/` directory exists, use that instead.

## Rationale

- Agents can read markdown files with their existing Read tool — no special tooling needed
- Human-readable and human-editable
- Zero infrastructure — no DB connection needed at session close
- Compatible with the `.agents/` convention already used for supplements and skills

Rejected alternatives:
- **SQLite only** — agents can't query SQL with standard tools
- **JSON** — harder for humans to scan than a markdown table

## Consequences

**Easier:** Any agent can read the history with a simple Read tool call.

**Harder:** No structured queries. Appending to a file that grows without bound over time (acceptable for v1).

Superseded in part by ADR-002, which adds a parallel SQLite record for structured queries.
