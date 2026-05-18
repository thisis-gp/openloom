# ADR-003: Per-agent supplement files via .agents/

**Status:** Accepted

## Context

Different agents (build, plan, general, explore, scout) need different behavioral guidelines — Slate integration, autonomy rules, read-only constraints. These need to be:
- Configurable per-project (override at project level)
- Configurable globally (override at user level)
- Shipped as defaults without requiring user setup

## Decision

Implement `agentSupplement()` in `system.ts` that walks up the directory tree checking `.agents/<name>.md`, then `~/.agents/<name>.md`, then falls back to compiled-in defaults bundled in `src/agent/prompt/*.supplement.md`.

The supplement is inserted into the system array between CLAUDE.md instructions and the skills list.

## Rationale

- Mirrors the `.env` / `CLAUDE.md` convention of walking up the directory tree
- Users can override per-project without touching the binary
- Compiled-in defaults ensure sensible behavior even without user config
- No MCP or network overhead — pure file reads

## Consequences

**Easier:** Any project can customize how each agent behaves by dropping a `.agents/build.md` file.

**Harder:** Supplement ordering matters — supplements currently come after CLAUDE.md but before skills. If a supplement contradicts CLAUDE.md, CLAUDE.md loses (wrong). Future: may need priority negotiation.
