# ADR-004: Slate integration via CLI, not MCP

**Status:** Accepted

## Context

Agents need access to Slate task context (description, acceptance criteria, subtasks, status) to do their work effectively. Slate could be exposed as an MCP server or as a CLI tool.

## Decision

Agents use the `slate` CLI via the shell tool. MCP is explicitly avoided for Slate.

## Rationale

**MCP overhead:** Every MCP tool call goes through the MCP protocol layer (JSON-RPC over stdio), adding latency and token overhead for the tool schema definition that appears in every context window.

**CLI simplicity:** `slate task show BX-42` is a single shell command. Agents already have the shell tool. No additional server process, no additional auth, no additional config.

**Teachability:** Agent supplement files can describe the exact CLI commands in plain text, which is more reliable than teaching agents to use a new MCP tool schema.

Rejected alternative:
- **Slate MCP server:** Each MCP tool's schema (~200-400 tokens each) would appear in every context window even when not needed. For 10 Slate tools, that's 2,000-4,000 tokens per request wasted.

## Consequences

**Easier:** No MCP server to run, no auth to configure, agents can use Slate in any shell.

**Harder:** Slate must be installed and in PATH. No structured return types — agents parse text output.
