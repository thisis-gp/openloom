# Openloom Agent Capability & Intelligence Layer — Design Spec

**Date:** 2026-05-19  
**Status:** Approved  
**Source:** Features ported/inspired from ruflo and hermes-agent  

---

## Overview

Add seven integrated subsystems to openloom, all implemented as Effect Layers inside `packages/opencode/src/`. The goal: make openloom a capable always-on agentic OS with smart model routing, cost-efficient context handling, persistent cross-session memory, true parallel subagent work, and background scheduled jobs.

No new monorepo packages. Everything lives inside `packages/opencode`.

---

## Architecture

```
packages/opencode/src/
  intelligence/
    router/       — multi-provider model router (Thompson sampling)
    compression/  — context compression (multi-strategy, reasoning-aware)
  memory/
    curator/      — periodic nudge + multi-tier memory (recent/archive/pruned)
    vector/       — HNSW index for semantic search
    graph/        — knowledge graph (entities + relationships)
  subagent/       — delegate_task tool + isolated child agent execution
  cron/           — background job scheduler + cron_* tools
```

Each subsystem exposes an Effect Layer and integrates with existing layers: `Session`, `Database`, `ToolRegistry`, `Provider`. No changes to the existing layer wiring contract — new layers are added to the composition root.

---

## Subsystem 1: Intelligence — Router

**Location:** `src/intelligence/router/`

### What it does
Routes each LLM request to the best available model across all providers (Anthropic, OpenAI, Gemini, Groq, DeepSeek, Grok, OpenRouter, etc.) using Thompson sampling with cost adjustment.

### How it works
Each model has Beta(α, β) priors tracking success/failure outcomes. On each request:

1. Read task signals: estimated token count, task type (code / research / chat / reasoning)
2. Sample from each candidate model's Beta distribution
3. Apply cost multiplier: cheaper models get a boost for simple tasks
4. Route to the winner
5. Record outcome (success/failure/cost) and update priors

Self-corrects after ~50 outcomes per model. Explicit user model selection bypasses routing.

### Config
New `router.config.ts` alongside existing provider configs. Contains per-model metadata: cost per token, tier (fast/balanced/powerful), capability flags (vision, reasoning, code).

### Data
Priors stored in a new `RouterOutcomeTable` in SQLite: `model_id`, `provider_id`, `alpha`, `beta`, `total_calls`, `last_updated`.

---

## Subsystem 2: Intelligence — Context Compression

**Location:** `src/intelligence/compression/`

### What it does
Automatically compresses session context when approaching the context limit, reducing token costs and extending session length.

### Trigger
Fires when a session reaches a configurable threshold of its context limit (default: 80%).

### Strategies (applied in order)
1. **Pruning** — drop tool call results older than a configurable age (default: 10 turns)
2. **Abstraction** — strip verbosity from older assistant messages, preserve structure and decisions
3. **Summary** — LLM-based rolling summary of the oldest message window

### Constraints
- Reasoning/thinking tokens are never compressed
- Focus mode: compress everything except the last N messages (configurable, default 10)
- Compressed messages are flagged in `MessageTable` (`compressed: true`), never deleted — full history preserved

### Integration
Hooks into the existing session message pipeline. Compression runs before a new message is sent if the threshold is breached.

---

## Subsystem 3: Memory — Curator

**Location:** `src/memory/curator/`

### What it does
Periodically classifies, archives, and prunes session messages so the agent builds a persistent cross-session memory without manual intervention.

### Triggers
- After every N messages in an active session (configurable, default: 20)
- On session end

### Process
1. Classify recent unprocessed messages: **important** (decisions, code changes, discoveries) or **routine** (confirmations, small edits, chatter)
2. Promote important messages to the archive tier with a compressed representation
3. Prune routine messages beyond retention window
4. Write a "memory nudge" back into the session — a brief assistant message summarising what was remembered

### Memory tiers (all SQLite)
| Tier | Contents | Retention |
|------|----------|-----------|
| recent | Last 50 messages, full fidelity | Always |
| archive | Older important messages, compressed | Configurable (default: 90 days) |
| pruned | Tombstone only (id + timestamp) | Permanent audit trail |

### CLI
`openloom memory backup` and `openloom memory restore` for export/import.

---

## Subsystem 4: Memory — Vector Index

**Location:** `src/memory/vector/`

### What it does
Adds semantic search on top of the existing SQLite session storage using an HNSW vector index.

### How it works
- Each message promoted to the archive tier gets an embedding via the active provider's embedding endpoint (OpenAI `text-embedding-3-small` or equivalent). If the active provider doesn't support embeddings, falls back to a configurable dedicated embedding provider (default: OpenAI)
- HNSW index stored as a blob in SQLite alongside existing tables
- Built incrementally — no bulk re-indexing required

### Integration with session_search
The existing `session_search` tool gains a semantic search mode:
- If HNSW index exists: use cosine similarity ranking
- If no index yet: fall back to existing LIKE matching

Distance metric: cosine similarity. No external vector database required.

---

## Subsystem 5: Memory — Knowledge Graph

**Location:** `src/memory/graph/`

### What it does
Extracts entities and relationships from archived messages and stores them as a queryable graph, letting the agent answer questions like "what files have we worked on together?" or "what decisions did we make about auth?"

### Entity types extracted
File paths, function/class names, decisions (explicit or inferred), people/agents, concepts (recurring topics).

### Storage
Two new SQLite tables:
- `graph_nodes`: `id`, `type`, `label`, `session_id`, `created_at`, `pagerank_score`
- `graph_edges`: `id`, `from_node`, `to_node`, `relation`, `weight`, `created_at`

### Algorithms
- **PageRank** — scores node importance across sessions
- **Label propagation** — finds communities (related work clusters)

### Tool
New `memory_graph` tool registered in `ToolRegistry`. Accepts a natural language query, maps it to a graph traversal, returns related entities and their relationships.

---

## Subsystem 6: Subagent Delegation

**Location:** `src/subagent/`

### What it does
Lets the agent spawn isolated child agents to work on focused subtasks in parallel, without carrying parent session history.

### New tool: `delegate_task`

**Parameters:**
- `goal` (string) — the task for the child agent
- `agent` (string, default: `build`) — which agent mode
- `toolset_blocklist` (string[], optional) — tools to deny the child
- `await` (boolean, default: `true`) — block until done or fire-and-forget

**Default blocklist:** `delegate_task` (prevents recursion), `cron_create`, `cron_delete`

### Execution
1. Create a child session in `SessionTable` with `parent_id` = calling session id
2. Spawn child agent with fresh context — goal becomes the system prompt, no parent history
3. Apply toolset restrictions
4. On completion, inject result as a structured message into the parent session (await mode) or leave in child session (fire-and-forget)

### TUI
Child sessions appear indented under their parent in the session list. The existing `rootSessionID` traversal in `session_search` handles parent/child relationships without changes.

---

## Subsystem 7: Cron Scheduler

**Location:** `src/cron/`

### What it does
Runs agent jobs on a cron schedule. Openloom becomes an always-on agent OS that executes recurring tasks automatically.

### Storage
New `CronJobTable` in SQLite:

| Column | Type | Notes |
|--------|------|-------|
| id | string | UUID |
| name | string | Human name |
| schedule | string | Cron expression |
| goal | string | Prompt for the agent |
| agent | string | build/plan/general |
| toolset_blocklist | json | Tools to deny |
| auto_approve | boolean | Skip approval prompts |
| enabled | boolean | |
| last_run | timestamp | |
| next_run | timestamp | Pre-computed |
| created_at | timestamp | |

### Scheduler loop
- Starts with the app process
- Ticks every 60 seconds
- Checks for jobs where `next_run <= now` and `enabled = true`
- Spawns via the subagent delegation system (reuses that infrastructure)
- File-based lock prevents duplicate concurrent runs
- Updates `last_run` and computes next `next_run` after each execution

### Job output
Each run creates a child session linked via `cron_job_id`. Fully searchable via `session_search`. No separate archival needed.

### New tools
| Tool | Purpose |
|------|---------|
| `cron_create` | Create a job from natural language: "run the test suite every morning at 9am" |
| `cron_list` | List all jobs with next run time and last status |
| `cron_delete` | Remove a job by name or id |

### TUI
Status indicator shows when a cron job is running in the background. Completed cron sessions appear in the session list with a clock icon prefix.

---

## Data Model Summary

New SQLite tables added to the existing schema:

| Table | Subsystem |
|-------|-----------|
| `router_outcomes` | Router — Thompson sampling priors |
| `memory_archive` | Curator — archived messages |
| `memory_pruned` | Curator — tombstones |
| `vector_embeddings` | Vector — HNSW index blobs + metadata |
| `graph_nodes` | Knowledge graph — entities |
| `graph_edges` | Knowledge graph — relationships |
| `cron_jobs` | Cron — job definitions |

All tables use the existing `Database` layer and follow the existing Drizzle schema pattern.

---

## Integration Points

| Existing system | How new subsystems connect |
|----------------|---------------------------|
| `ToolRegistry` | `delegate_task`, `memory_graph`, `cron_create`, `cron_list`, `cron_delete` registered as standard tools |
| `SessionTable` | `parent_id` and `cron_job_id` columns added |
| `MessageTable` | `compressed`, `memory_tier`, `curator_run_id` columns added |
| `session_search` | Gains semantic search mode via vector index |
| `Provider` | Router wraps provider selection; compression uses provider for summarisation and embeddings |
| App startup | Scheduler loop and curator background tick started alongside existing services |

---

## Out of Scope

- Messaging gateway (Telegram, Discord, WhatsApp) — future phase
- Agent federation (cross-installation mesh) — future phase
- Neural learning / SONA — future phase
- Voice/audio — future phase
- Rust/WASM acceleration — future phase
