# Architecture Decision Records

ADRs document significant architectural decisions made during Openloom's development.

## Format

Each ADR is a file named `ADR-NNN-short-title.md` and contains:

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN
- **Context:** What is the situation and why does a decision need to be made?
- **Decision:** What was decided?
- **Rationale:** Why this option over the alternatives?
- **Consequences:** What gets easier, what gets harder?

## Index

| # | Title | Status |
|---|-------|--------|
| [001](ADR-001-markdown-session-memory.md) | Markdown files for session memory (Phase 1) | Accepted |
| [002](ADR-002-sqlite-memory-table.md) | SQLite session_memory table (Phase 2) | Accepted |
| [003](ADR-003-agent-supplement-system.md) | Per-agent supplement files via .agents/ | Accepted |
| [004](ADR-004-slate-cli-not-mcp.md) | Slate integration via CLI not MCP | Accepted |
| [005](ADR-005-deepseek-prompt.md) | Separate prompt file for DeepSeek/Qwen models | Accepted |
