# Foundation: DB Schema Migrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all new SQLite tables and schema files required by the intelligence, memory, subagent, and cron subsystems.

**Architecture:** Each new subsystem gets a `*.sql.ts` schema file in its directory and a single shared migration that adds all new tables at once. Existing table alterations (`session.cron_job_id`, `message.compressed`, `message.memory_tier`, `message.curator_run_id`) are included in the same migration.

**Tech Stack:** Drizzle ORM, SQLite (bun:sqlite), Effect, TypeScript

---

## Dependency Order

Tasks 1–5 are independent (create new schema files). Task 6 depends on all schema files existing (migration SQL). Task 7 depends on Task 6 (integration test). Task 8 depends on Task 7 (alters existing tables that tests reference).

```
Tasks 1-5 (parallel) → Task 6 → Task 7 → commit → Task 8 → commit
```

## Implementation Corrections

These corrections supersede stale snippets in this plan:

- Run `bun typecheck` from `packages/opencode`; do not run `tsc` directly.
- On Windows/PowerShell, use `Select-String` for targeted output checks instead of `grep`.
- `MessageTable` must include nullable `curator_run_id` metadata. Plan 4 writes it and the spec requires traceability from a message to the curator run that classified it.
- Drizzle returns `null` for nullable columns in these tests; assertions should use `toBeNull()`, not `toBeUndefined()`.
- `cron_jobs` is the canonical table name. Downstream plans must not introduce a singular `cron_job` table.
- Cron schema should include minimal operational bookkeeping now: `running_session_id`, `last_error`, and `run_count`.
- Add dedupe constraints or unique indexes where reruns are expected: memory archive by original `message_id`, vector embeddings by `archive_id`, graph nodes by `(session_id, type, label)`, and graph edges by `(from_node_id, to_node_id, relation)`.

## File Map

| Task | Files Created/Modified |
|------|----------------------|
| 1 | `packages/opencode/src/intelligence/router/router.sql.ts` |
| 2 | `packages/opencode/src/memory/curator/curator.sql.ts` |
| 3 | `packages/opencode/src/memory/vector/vector.sql.ts` |
| 4 | `packages/opencode/src/memory/graph/graph.sql.ts` |
| 5 | `packages/opencode/src/cron/cron.sql.ts` |
| 6 | `packages/opencode/migration/20260519000000_add_intelligence_tables/migration.sql` |
| 7 | `packages/opencode/test/tool/session_search.test.ts` (integration test) — actually: `packages/opencode/test/storage/intelligence-tables.test.ts` |
| 8 | `packages/opencode/src/session/session.sql.ts` (modify) |

---

## Task 1 — Create `router.sql.ts` (RouterOutcomeTable)

**Files:** Create `packages/opencode/src/intelligence/router/router.sql.ts`

**Context:** This table stores Thompson sampling alpha/beta priors per (model_id, provider_id) pair. The composite primary key is declared via Drizzle's `primaryKey()` helper, not a single `.primaryKey()` column call.

### Steps

- [ ] **1.1** Create the directory structure if it does not exist:
  ```
  packages/opencode/src/intelligence/router/
  ```

- [ ] **1.2** Create the file `packages/opencode/src/intelligence/router/router.sql.ts` with this exact content:

```typescript
import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../../storage/schema.sql"

/**
 * Stores Thompson sampling alpha/beta priors for each (model_id, provider_id) pair.
 * alpha and beta are updated after each model call outcome (success=alpha++, failure=beta++).
 * Expected success probability = alpha / (alpha + beta).
 */
export const RouterOutcomeTable = sqliteTable(
  "router_outcomes",
  {
    model_id: text().notNull(),
    provider_id: text().notNull(),
    alpha: real().notNull().default(1.0),
    beta: real().notNull().default(1.0),
    total_calls: integer().notNull().default(0),
    last_cost_usd: real(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.model_id, table.provider_id] }),
    index("router_outcomes_provider_idx").on(table.provider_id),
  ],
)
```

- [ ] **1.3** Verify TypeScript compiles cleanly (no schema errors):
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "router.sql"
  ```
  Expected: no lines mentioning `router.sql`.

---

## Task 2 — Create `curator.sql.ts` (MemoryArchiveTable + CuratorRunTable)

**Files:** Create `packages/opencode/src/memory/curator/curator.sql.ts`

**Context:** Two tables. `memory_archive` stores classified messages with compression metadata. `curator_runs` is an audit log. The `embedding_id` on `memory_archive` is a forward reference to `vector_embeddings` — declare it as plain `text()` (nullable) since the FK is defined in the opposite direction (`vector_embeddings.archive_id → memory_archive`). This avoids circular imports.

### Steps

- [ ] **2.1** Create the directory structure if it does not exist:
  ```
  packages/opencode/src/memory/curator/
  ```

- [ ] **2.2** Create the file `packages/opencode/src/memory/curator/curator.sql.ts` with this exact content:

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../../session/session.sql"
import { Timestamps } from "../../storage/schema.sql"
import type { SessionID } from "../../session/schema"

export type MemoryTier = "archive" | "pruned"
export type MessageImportance = "important" | "routine"

/**
 * Stores curator-classified and compressed messages.
 * Messages in 'archive' tier are summarised and optionally embedded.
 * Messages in 'pruned' tier are removed from the active context window.
 */
export const MemoryArchiveTable = sqliteTable(
  "memory_archive",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    /** The original MessageTable.id this archive entry was derived from */
    message_id: text().notNull(),
    /** 'archive' = compressed summary retained; 'pruned' = dropped from context */
    tier: text().$type<MemoryTier>().notNull(),
    /** Curator-assigned importance classification */
    importance: text().$type<MessageImportance>().notNull(),
    /** Compressed plain-text representation of the original message */
    content: text().notNull(),
    /**
     * FK to vector_embeddings.id — nullable because embedding is generated
     * asynchronously after archival. Declared as plain text to avoid circular import;
     * the FK constraint lives in the migration SQL.
     */
    embedding_id: text(),
    /** The curator_runs.id for the run that created this record */
    curator_run_id: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("memory_archive_session_idx").on(table.session_id),
    index("memory_archive_tier_idx").on(table.tier),
  ],
)

/**
 * Audit log of curator executions. One row per curator run.
 */
export const CuratorRunTable = sqliteTable(
  "curator_runs",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    /** What caused the curator to run */
    trigger: text().$type<"message_threshold" | "session_end">().notNull(),
    messages_classified: integer().notNull().default(0),
    messages_archived: integer().notNull().default(0),
    messages_pruned: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [index("curator_runs_session_idx").on(table.session_id)],
)
```

- [ ] **2.3** Verify TypeScript compiles cleanly:
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "curator.sql"
  ```
  Expected: no lines mentioning `curator.sql`.

---

## Task 3 — Create `vector.sql.ts` (VectorEmbeddingTable)

**Files:** Create `packages/opencode/src/memory/vector/vector.sql.ts`

**Context:** Embeddings are stored as JSON text arrays (SQLite has no native vector type). The HNSW in-memory index is built at runtime from this table at session load. The FK back to `memory_archive` is declared here; the forward reference from `curator.sql.ts` is left as plain text to avoid circular imports.

### Steps

- [ ] **3.1** Create the directory structure if it does not exist:
  ```
  packages/opencode/src/memory/vector/
  ```

- [ ] **3.2** Create the file `packages/opencode/src/memory/vector/vector.sql.ts` with this exact content:

```typescript
import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { MemoryArchiveTable } from "../curator/curator.sql"
import { Timestamps } from "../../storage/schema.sql"
import type { SessionID } from "../../session/schema"

/**
 * Stores embedding vectors for archived messages.
 * Each row corresponds to one MemoryArchiveTable entry that has been embedded.
 * Vectors are stored as JSON-serialised float arrays; an HNSW index is rebuilt
 * in-memory at session load time using the `hnswlib-node` package.
 */
export const VectorEmbeddingTable = sqliteTable(
  "vector_embeddings",
  {
    id: text().primaryKey(),
    archive_id: text()
      .notNull()
      .references(() => MemoryArchiveTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionID>().notNull(),
    /** Embedding model identifier, e.g. "text-embedding-3-small" */
    model: text().notNull(),
    /** JSON-serialised float array, e.g. "[0.123, -0.456, ...]" */
    vector: text().notNull(),
    ...Timestamps,
  },
  (table) => [index("vector_embeddings_session_idx").on(table.session_id)],
)
```

- [ ] **3.3** Verify TypeScript compiles cleanly:
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "vector.sql"
  ```
  Expected: `OK`.

---

## Task 4 — Create `graph.sql.ts` (GraphNodeTable + GraphEdgeTable)

**Files:** Create `packages/opencode/src/memory/graph/graph.sql.ts`

**Context:** Two tables representing a directed knowledge graph. Nodes are entities (files, functions, decisions, people, concepts). Edges are typed relationships. PageRank scores and community IDs are written back by the graph analytics layer.

### Steps

- [ ] **4.1** Create the directory structure if it does not exist:
  ```
  packages/opencode/src/memory/graph/
  ```

- [ ] **4.2** Create the file `packages/opencode/src/memory/graph/graph.sql.ts` with this exact content:

```typescript
import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../../session/session.sql"
import { Timestamps } from "../../storage/schema.sql"
import type { SessionID } from "../../session/schema"

export type GraphNodeType = "file" | "function" | "decision" | "person" | "concept"
export type GraphEdgeRelation = "references" | "modifies" | "decides" | "mentions" | "depends_on"

/**
 * Entities in the session knowledge graph.
 * pagerank_score and community_id are populated by the graph analytics layer
 * after each incremental update.
 */
export const GraphNodeTable = sqliteTable(
  "graph_nodes",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<GraphNodeType>().notNull(),
    /** Human-readable label, e.g. file path or function name */
    label: text().notNull(),
    /** PageRank score, updated after each graph mutation */
    pagerank_score: real().notNull().default(0.0),
    /** Louvain community identifier, null until first community detection run */
    community_id: text(),
    ...Timestamps,
  },
  (table) => [
    index("graph_nodes_session_idx").on(table.session_id),
    index("graph_nodes_type_idx").on(table.type),
  ],
)

/**
 * Directed edges in the session knowledge graph.
 * Weight defaults to 1.0; higher weights indicate stronger relationships.
 */
export const GraphEdgeTable = sqliteTable(
  "graph_edges",
  {
    id: text().primaryKey(),
    from_node_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    to_node_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    relation: text().$type<GraphEdgeRelation>().notNull(),
    weight: real().notNull().default(1.0),
    session_id: text().$type<SessionID>().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("graph_edges_from_node_idx").on(table.from_node_id),
    index("graph_edges_to_node_idx").on(table.to_node_id),
    index("graph_edges_session_idx").on(table.session_id),
  ],
)
```

- [ ] **4.3** Verify TypeScript compiles cleanly:
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "graph.sql"
  ```
  Expected: `OK`.

---

## Task 5 — Create `cron.sql.ts` (CronJobTable)

**Files:** Create `packages/opencode/src/cron/cron.sql.ts`

**Context:** Stores cron job definitions. `toolset_blocklist` is a JSON array of tool IDs. `auto_approve` and `enabled` are SQLite booleans (stored as integers 0/1). `last_run`, `next_run`, and `last_session_id` are nullable — they start null and are populated on the first execution.

### Steps

- [ ] **5.1** Create the directory structure if it does not exist:
  ```
  packages/opencode/src/cron/
  ```

- [ ] **5.2** Create the file `packages/opencode/src/cron/cron.sql.ts` with this exact content:

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "../project/schema"
import type { SessionID } from "../session/schema"

/**
 * Defines a scheduled agentic task.
 * The scheduler reads rows where `enabled = 1` and `next_run <= now()` to
 * dispatch new sessions. After each dispatch it updates `last_run`, `next_run`,
 * and `last_session_id`.
 */
export const CronJobTable = sqliteTable(
  "cron_jobs",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    /** Human-readable name for display in the UI */
    name: text().notNull(),
    /** Standard cron expression, e.g. "0 9 * * 1-5" (weekdays at 09:00) */
    schedule: text().notNull(),
    /** Natural-language goal passed as the initial prompt to the spawned session */
    goal: text().notNull(),
    /** Agent preset to use for the spawned session, defaults to 'build' */
    agent: text().notNull().default("build"),
    /** JSON array of tool IDs to block, e.g. '["bash","file_write"]'. Null = no blocklist */
    toolset_blocklist: text({ mode: "json" }).$type<string[]>(),
    /** If 1, the spawned session runs without user approval gates */
    auto_approve: integer().notNull().default(0),
    /** If 0, this job is paused and will not be dispatched */
    enabled: integer().notNull().default(1),
    /** Unix timestamp (ms) of the most recent run, null if never run */
    last_run: integer(),
    /** Unix timestamp (ms) of the next scheduled run, null until first schedule calculation */
    next_run: integer(),
    /** SessionID of the most recently spawned session, null if never run */
    last_session_id: text().$type<SessionID>(),
    /** SessionID currently running for this job, null when idle */
    running_session_id: text().$type<SessionID>(),
    /** Most recent scheduler or child-session error, null when healthy */
    last_error: text(),
    /** Number of times the scheduler has attempted to run this job */
    run_count: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [
    index("cron_jobs_project_idx").on(table.project_id),
    index("cron_jobs_next_run_idx").on(table.next_run),
    index("cron_jobs_enabled_next_run_idx").on(table.enabled, table.next_run),
  ],
)
```

- [ ] **5.3** Verify TypeScript compiles cleanly:
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "cron.sql"
  ```
  Expected: `OK`.

---

## Task 6 — Create the Migration SQL

**Files:** Create `packages/opencode/migration/20260519000000_add_intelligence_tables/migration.sql`

**Context:** A single migration creates all 7 new tables and alters the `session` and `message` tables. The migration filename timestamp `20260519000000` places it after `20260518120000_session_memory` so it is applied in the correct order. The `ALTER TABLE ADD COLUMN` statements must come after all `CREATE TABLE` statements (forward FK references in memory_archive and cron_jobs).

**Important SQLite constraints:**
- SQLite does not support `ADD COLUMN ... REFERENCES`. The FK is documented in comments only.
- `ALTER TABLE ... ADD COLUMN` cannot add NOT NULL columns without a default on existing tables.
- The `memory_archive.embedding_id` soft FK to `vector_embeddings` is documented in a comment, not enforced (avoids the circular dependency issue at DB level too).

### Steps

- [ ] **6.1** Create the directory:
  ```
  packages/opencode/migration/20260519000000_add_intelligence_tables/
  ```

- [ ] **6.2** Create the file `packages/opencode/migration/20260519000000_add_intelligence_tables/migration.sql` with this exact content:

```sql
-- =============================================================================
-- Migration: 20260519000000_add_intelligence_tables
-- Adds all tables for the intelligence, memory, graph, and cron subsystems.
-- Also alters `session` and `message` to add new nullable columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. router_outcomes — Thompson sampling priors per (model_id, provider_id)
-- -----------------------------------------------------------------------------
CREATE TABLE `router_outcomes` (
  `model_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `alpha` real DEFAULT 1.0 NOT NULL,
  `beta` real DEFAULT 1.0 NOT NULL,
  `total_calls` integer DEFAULT 0 NOT NULL,
  `last_cost_usd` real,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  PRIMARY KEY (`model_id`, `provider_id`)
);
--> statement-breakpoint
CREATE INDEX `router_outcomes_provider_idx` ON `router_outcomes` (`provider_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 2. curator_runs — Audit log of curator executions
-- -----------------------------------------------------------------------------
CREATE TABLE `curator_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `trigger` text NOT NULL,
  `messages_classified` integer DEFAULT 0 NOT NULL,
  `messages_archived` integer DEFAULT 0 NOT NULL,
  `messages_pruned` integer DEFAULT 0 NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `curator_runs_session_idx` ON `curator_runs` (`session_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 3. memory_archive — Curator-classified compressed messages
-- -----------------------------------------------------------------------------
CREATE TABLE `memory_archive` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `message_id` text NOT NULL,
  `tier` text NOT NULL,
  `importance` text NOT NULL,
  `content` text NOT NULL,
  -- soft FK to vector_embeddings(id); enforced at application layer to avoid circular DDL
  `embedding_id` text,
  `curator_run_id` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `memory_archive_session_idx` ON `memory_archive` (`session_id`);
--> statement-breakpoint
CREATE INDEX `memory_archive_tier_idx` ON `memory_archive` (`tier`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 4. vector_embeddings — Embedding vectors for archived messages
-- -----------------------------------------------------------------------------
CREATE TABLE `vector_embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `archive_id` text NOT NULL,
  `session_id` text NOT NULL,
  `model` text NOT NULL,
  `vector` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`archive_id`) REFERENCES `memory_archive`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `vector_embeddings_session_idx` ON `vector_embeddings` (`session_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 5. graph_nodes — Knowledge graph entities
-- -----------------------------------------------------------------------------
CREATE TABLE `graph_nodes` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `type` text NOT NULL,
  `label` text NOT NULL,
  `pagerank_score` real DEFAULT 0.0 NOT NULL,
  `community_id` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `graph_nodes_session_idx` ON `graph_nodes` (`session_id`);
--> statement-breakpoint
CREATE INDEX `graph_nodes_type_idx` ON `graph_nodes` (`type`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 6. graph_edges — Knowledge graph relationships
-- -----------------------------------------------------------------------------
CREATE TABLE `graph_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `from_node_id` text NOT NULL,
  `to_node_id` text NOT NULL,
  `relation` text NOT NULL,
  `weight` real DEFAULT 1.0 NOT NULL,
  `session_id` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`from_node_id`) REFERENCES `graph_nodes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`to_node_id`) REFERENCES `graph_nodes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `graph_edges_from_node_idx` ON `graph_edges` (`from_node_id`);
--> statement-breakpoint
CREATE INDEX `graph_edges_to_node_idx` ON `graph_edges` (`to_node_id`);
--> statement-breakpoint
CREATE INDEX `graph_edges_session_idx` ON `graph_edges` (`session_id`);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 7. cron_jobs — Scheduled agentic task definitions
-- -----------------------------------------------------------------------------
CREATE TABLE `cron_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `name` text NOT NULL,
  `schedule` text NOT NULL,
  `goal` text NOT NULL,
  `agent` text DEFAULT 'build' NOT NULL,
  `toolset_blocklist` text,
  `auto_approve` integer DEFAULT 0 NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `last_run` integer,
  `next_run` integer,
  `last_session_id` text,
  `running_session_id` text,
  `last_error` text,
  `run_count` integer DEFAULT 0 NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `cron_jobs_project_idx` ON `cron_jobs` (`project_id`);
--> statement-breakpoint
CREATE INDEX `cron_jobs_next_run_idx` ON `cron_jobs` (`next_run`);
--> statement-breakpoint
CREATE INDEX `cron_jobs_enabled_next_run_idx` ON `cron_jobs` (`enabled`, `next_run`);
--> statement-breakpoint

-- =============================================================================
-- ALTER existing tables — all new columns are nullable or have defaults so
-- ALTER TABLE ADD COLUMN works on a populated database without a full rewrite.
-- =============================================================================

-- Add cron_job_id to session (nullable — null means human-initiated session)
ALTER TABLE `session` ADD COLUMN `cron_job_id` text;
--> statement-breakpoint

-- Add compressed flag to message (0 = not compressed, 1 = compressed by context compression)
ALTER TABLE `message` ADD COLUMN `compressed` integer DEFAULT 0;
--> statement-breakpoint

-- Add memory_tier to message (null = not yet classified by curator)
ALTER TABLE `message` ADD COLUMN `memory_tier` text;
--> statement-breakpoint

-- Add curator_run_id to message (null = not yet classified by curator)
ALTER TABLE `message` ADD COLUMN `curator_run_id` text;
```

- [ ] **6.3** Verify the migration directory name sorts after the previous migration:
  ```bash
  ls packages/opencode/migration | tail -5
  ```
  Expected last two entries:
  ```
  20260518120000_session_memory
  20260519000000_add_intelligence_tables
  ```

---

## Task 7 — Write and Run Integration Test

**Files:** Create `packages/opencode/test/storage/intelligence-tables.test.ts`

**Context:** This test uses a live in-memory database (via `OPENLOOM_DB=:memory:` environment variable, set in the `Flag` module) to verify all 7 new tables exist and support basic insert/select. The test imports from the schema files created in Tasks 1–5 and uses `Database.use()` directly — no Effect layer needed for raw Drizzle queries. We use `bun:test` directly (no Effect wrapper) because we are testing the DB schema, not service logic.

### Steps

- [ ] **7.1** Write a **failing** test first (before the migration SQL exists — or simply check the test file compiles):

  The test will naturally fail before Task 6 is complete because the tables do not exist. After Task 6, re-run and it must pass.

- [ ] **7.2** Create the file `packages/opencode/test/storage/intelligence-tables.test.ts`:

```typescript
/**
 * Integration test: verifies all intelligence/memory/cron tables were created
 * by migration 20260519000000_add_intelligence_tables.
 *
 * Uses an in-memory SQLite database so the test is hermetic and fast.
 * Run with: bun test packages/opencode/test/storage/intelligence-tables.test.ts --timeout 15000
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Database } from "@/storage/db"
import { RouterOutcomeTable } from "@/intelligence/router/router.sql"
import { MemoryArchiveTable, CuratorRunTable } from "@/memory/curator/curator.sql"
import { VectorEmbeddingTable } from "@/memory/vector/vector.sql"
import { GraphNodeTable, GraphEdgeTable } from "@/memory/graph/graph.sql"
import { CronJobTable } from "@/cron/cron.sql"
import { SessionTable, MessageTable } from "@/session/session.sql"
import { eq } from "drizzle-orm"

// Use an in-memory database for all tests in this file.
// IMPORTANT: set the env flag before importing Database so Client() picks it up.
process.env["OPENLOOM_DB"] = ":memory:"

const SESSION_ID = "ses_test_intel_001" as any
const PROJECT_ID = "proj_test_intel_001" as any

beforeAll(() => {
  // Force a fresh client with the :memory: path
  Database.Client.reset()
  Database.Client()
})

afterAll(() => {
  Database.close()
  Database.Client.reset()
  delete process.env["OPENLOOM_DB"]
})

// ---------------------------------------------------------------------------
// Helper: seed a minimal project + session row (required by FK constraints)
// ---------------------------------------------------------------------------
function seedProjectAndSession() {
  Database.use((db) => {
    // Insert project
    db.insert(require("@/project/project.sql").ProjectTable)
      .values({
        id: PROJECT_ID,
        worktree: "/tmp/test",
        sandboxes: JSON.stringify([]),
        time_created: Date.now(),
        time_updated: Date.now(),
      })
      .onConflictDoNothing()
      .run()

    // Insert session
    db.insert(SessionTable)
      .values({
        id: SESSION_ID,
        project_id: PROJECT_ID,
        slug: "test-session",
        directory: "/tmp/test",
        title: "Test Session",
        version: "0.0.0",
        cost: 0,
        tokens_input: 0,
        tokens_output: 0,
        tokens_reasoning: 0,
        tokens_cache_read: 0,
        tokens_cache_write: 0,
        time_created: Date.now(),
        time_updated: Date.now(),
      })
      .onConflictDoNothing()
      .run()
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("intelligence tables — schema migration", () => {
  test("seeds project and session rows", () => {
    expect(() => seedProjectAndSession()).not.toThrow()
  })

  // --- router_outcomes ---
  describe("router_outcomes", () => {
    test("inserts a RouterOutcome row", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(RouterOutcomeTable)
          .values({
            model_id: "gpt-4o",
            provider_id: "openai",
            alpha: 3.0,
            beta: 1.0,
            total_calls: 4,
            last_cost_usd: 0.012,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the RouterOutcome row", () => {
      const rows = Database.use((db) =>
        db.select().from(RouterOutcomeTable).where(eq(RouterOutcomeTable.model_id, "gpt-4o")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.provider_id).toBe("openai")
      expect(rows[0]!.alpha).toBe(3.0)
      expect(rows[0]!.total_calls).toBe(4)
    })

    test("defaults alpha=1.0 and beta=1.0 for a new model", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(RouterOutcomeTable)
          .values({
            model_id: "claude-3-5-sonnet",
            provider_id: "anthropic",
            time_created: now,
            time_updated: now,
          })
          .run()
      })
      const rows = Database.use((db) =>
        db.select().from(RouterOutcomeTable).where(eq(RouterOutcomeTable.model_id, "claude-3-5-sonnet")).all(),
      )
      expect(rows[0]!.alpha).toBe(1.0)
      expect(rows[0]!.beta).toBe(1.0)
    })
  })

  // --- curator_runs ---
  describe("curator_runs", () => {
    test("inserts a CuratorRun row", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(CuratorRunTable)
          .values({
            id: "run_001",
            session_id: SESSION_ID,
            trigger: "message_threshold",
            messages_classified: 20,
            messages_archived: 12,
            messages_pruned: 8,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the CuratorRun row", () => {
      const rows = Database.use((db) =>
        db.select().from(CuratorRunTable).where(eq(CuratorRunTable.id, "run_001")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.trigger).toBe("message_threshold")
      expect(rows[0]!.messages_archived).toBe(12)
    })
  })

  // --- memory_archive ---
  describe("memory_archive", () => {
    test("inserts a MemoryArchive row", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(MemoryArchiveTable)
          .values({
            id: "arch_001",
            session_id: SESSION_ID,
            message_id: "msg_original_001",
            tier: "archive",
            importance: "important",
            content: "User requested a refactor of the auth module.",
            embedding_id: null,
            curator_run_id: "run_001",
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the MemoryArchive row", () => {
      const rows = Database.use((db) =>
        db.select().from(MemoryArchiveTable).where(eq(MemoryArchiveTable.id, "arch_001")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.tier).toBe("archive")
      expect(rows[0]!.importance).toBe("important")
      expect(rows[0]!.embedding_id).toBeNull()
    })
  })

  // --- vector_embeddings ---
  describe("vector_embeddings", () => {
    test("inserts a VectorEmbedding row", () => {
      const now = Date.now()
      const vector = JSON.stringify(Array.from({ length: 8 }, (_, i) => i * 0.1))
      Database.use((db) => {
        db.insert(VectorEmbeddingTable)
          .values({
            id: "emb_001",
            archive_id: "arch_001",
            session_id: SESSION_ID,
            model: "text-embedding-3-small",
            vector,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the VectorEmbedding row", () => {
      const rows = Database.use((db) =>
        db.select().from(VectorEmbeddingTable).where(eq(VectorEmbeddingTable.id, "emb_001")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.model).toBe("text-embedding-3-small")
      const vec = JSON.parse(rows[0]!.vector)
      expect(vec).toHaveLength(8)
    })

    test("updates the memory_archive.embedding_id back-reference", () => {
      Database.use((db) => {
        db.update(MemoryArchiveTable)
          .set({ embedding_id: "emb_001" })
          .where(eq(MemoryArchiveTable.id, "arch_001"))
          .run()
      })
      const rows = Database.use((db) =>
        db.select().from(MemoryArchiveTable).where(eq(MemoryArchiveTable.id, "arch_001")).all(),
      )
      expect(rows[0]!.embedding_id).toBe("emb_001")
    })
  })

  // --- graph_nodes ---
  describe("graph_nodes", () => {
    test("inserts GraphNode rows", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(GraphNodeTable)
          .values([
            {
              id: "node_001",
              session_id: SESSION_ID,
              type: "file",
              label: "src/auth/auth.ts",
              pagerank_score: 0.42,
              community_id: "c0",
              time_created: now,
              time_updated: now,
            },
            {
              id: "node_002",
              session_id: SESSION_ID,
              type: "function",
              label: "verifyToken",
              pagerank_score: 0.31,
              community_id: "c0",
              time_created: now,
              time_updated: now,
            },
          ])
          .run()
      })
    })

    test("reads back GraphNode rows by type", () => {
      const rows = Database.use((db) =>
        db.select().from(GraphNodeTable).where(eq(GraphNodeTable.type, "file")).all(),
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.label).toBe("src/auth/auth.ts")
    })
  })

  // --- graph_edges ---
  describe("graph_edges", () => {
    test("inserts a GraphEdge row", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(GraphEdgeTable)
          .values({
            id: "edge_001",
            from_node_id: "node_001",
            to_node_id: "node_002",
            relation: "references",
            weight: 1.5,
            session_id: SESSION_ID,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the GraphEdge row", () => {
      const rows = Database.use((db) =>
        db.select().from(GraphEdgeTable).where(eq(GraphEdgeTable.id, "edge_001")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.relation).toBe("references")
      expect(rows[0]!.weight).toBe(1.5)
    })
  })

  // --- cron_jobs ---
  describe("cron_jobs", () => {
    test("inserts a CronJob row", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(CronJobTable)
          .values({
            id: "cron_001",
            project_id: PROJECT_ID,
            name: "Daily dependency audit",
            schedule: "0 9 * * 1-5",
            goal: "Run bun audit and open issues for any high-severity vulnerabilities found.",
            agent: "build",
            toolset_blocklist: null,
            auto_approve: 0,
            enabled: 1,
            last_run: null,
            next_run: now + 86400000,
            last_session_id: null,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("reads back the CronJob row", () => {
      const rows = Database.use((db) =>
        db.select().from(CronJobTable).where(eq(CronJobTable.id, "cron_001")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.schedule).toBe("0 9 * * 1-5")
      expect(rows[0]!.enabled).toBe(1)
      expect(rows[0]!.auto_approve).toBe(0)
      expect(rows[0]!.last_run).toBeNull()
    })

    test("disabled cron job stays disabled", () => {
      Database.use((db) => {
        db.update(CronJobTable)
          .set({ enabled: 0 })
          .where(eq(CronJobTable.id, "cron_001"))
          .run()
      })
      const rows = Database.use((db) =>
        db.select().from(CronJobTable).where(eq(CronJobTable.id, "cron_001")).all(),
      )
      expect(rows[0]!.enabled).toBe(0)
    })
  })

  // --- session.cron_job_id (new column) ---
  describe("session table — new columns", () => {
    test("cron_job_id column exists and defaults to null", () => {
      const rows = Database.use((db) =>
        db
          .select({ id: SessionTable.id, cron_job_id: SessionTable.cron_job_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, SESSION_ID))
          .all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.cron_job_id).toBeNull()
    })
  })

  // --- message.compressed and message.memory_tier (new columns) ---
  describe("message table — new columns", () => {
    test("can insert a message with new columns", () => {
      const now = Date.now()
      Database.use((db) => {
        db.insert(MessageTable)
          .values({
            id: "msg_001" as any,
            session_id: SESSION_ID,
            data: { role: "user", content: "hello" } as any,
            compressed: 0,
            memory_tier: null,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
    })

    test("compressed and memory_tier columns round-trip correctly", () => {
      const rows = Database.use((db) =>
        db.select().from(MessageTable).where(eq(MessageTable.id, "msg_001" as any)).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.compressed).toBe(0)
      expect(rows[0]!.memory_tier).toBeNull()
    })

    test("can mark a message as compressed with a memory_tier", () => {
      Database.use((db) => {
        db.update(MessageTable)
          .set({ compressed: 1, memory_tier: "archive" })
          .where(eq(MessageTable.id, "msg_001" as any))
          .run()
      })
      const rows = Database.use((db) =>
        db.select().from(MessageTable).where(eq(MessageTable.id, "msg_001" as any)).all(),
      )
      expect(rows[0]!.compressed).toBe(1)
      expect(rows[0]!.memory_tier).toBe("archive")
    })
  })
})
```

- [ ] **7.3** Run the test (expect all passing after Task 6 is complete):
  ```bash
  bun test packages/opencode/test/storage/intelligence-tables.test.ts --timeout 15000
  ```
  Expected output:
  ```
  bun test v1.x.x
  
  packages/opencode/test/storage/intelligence-tables.test.ts:
  ✓ intelligence tables — schema migration > seeds project and session rows
  ✓ intelligence tables — schema migration > router_outcomes > inserts a RouterOutcome row
  ✓ intelligence tables — schema migration > router_outcomes > reads back the RouterOutcome row
  ✓ intelligence tables — schema migration > router_outcomes > defaults alpha=1.0 and beta=1.0 for a new model
  ✓ intelligence tables — schema migration > curator_runs > inserts a CuratorRun row
  ✓ intelligence tables — schema migration > curator_runs > reads back the CuratorRun row
  ✓ intelligence tables — schema migration > memory_archive > inserts a MemoryArchive row
  ✓ intelligence tables — schema migration > memory_archive > reads back the MemoryArchive row
  ✓ intelligence tables — schema migration > vector_embeddings > inserts a VectorEmbedding row
  ✓ intelligence tables — schema migration > vector_embeddings > reads back the VectorEmbedding row
  ✓ intelligence tables — schema migration > vector_embeddings > updates the memory_archive.embedding_id back-reference
  ✓ intelligence tables — schema migration > graph_nodes > inserts GraphNode rows
  ✓ intelligence tables — schema migration > graph_nodes > reads back GraphNode rows by type
  ✓ intelligence tables — schema migration > graph_edges > inserts a GraphEdge row
  ✓ intelligence tables — schema migration > graph_edges > reads back the GraphEdge row
  ✓ intelligence tables — schema migration > cron_jobs > inserts a CronJob row
  ✓ intelligence tables — schema migration > cron_jobs > reads back the CronJob row
  ✓ intelligence tables — schema migration > cron_jobs > disabled cron job stays disabled
  ✓ intelligence tables — schema migration > session table — new columns > cron_job_id column exists and defaults to null
  ✓ intelligence tables — schema migration > message table — new columns > can insert a message with new columns
  ✓ intelligence tables — schema migration > message table — new columns > compressed and memory_tier columns round-trip correctly
  ✓ intelligence tables — schema migration > message table — new columns > can mark a message as compressed with a memory_tier
  
  22 pass, 0 fail
  ```

- [ ] **7.4** Commit once all tests pass:
  ```bash
  git add \
    packages/opencode/src/intelligence/router/router.sql.ts \
    packages/opencode/src/memory/curator/curator.sql.ts \
    packages/opencode/src/memory/vector/vector.sql.ts \
    packages/opencode/src/memory/graph/graph.sql.ts \
    packages/opencode/src/cron/cron.sql.ts \
    packages/opencode/migration/20260519000000_add_intelligence_tables/migration.sql \
    packages/opencode/test/storage/intelligence-tables.test.ts
  git commit -m "feat(db): add intelligence/memory/cron schema + migration 20260519000000"
  ```

---

## Task 8 — Update `session.sql.ts` (Add New Columns to Existing Tables)

**Files:** Modify `packages/opencode/src/session/session.sql.ts`

**Context:** The migration SQL (Task 6) already adds the columns at the database level via `ALTER TABLE`. This task updates the Drizzle schema to reflect those columns so TypeScript-level queries and type checking work correctly. Without this update, Drizzle's type system does not know the columns exist and any select/insert referencing them will fail type-checking.

**Columns to add:**

- `SessionTable`: `cron_job_id: text().$type<SessionID>()` — nullable, no `.notNull()`
- `MessageTable`:
  - `compressed: integer().default(0)` — nullable with default 0 (boolean)
  - `memory_tier: text().$type<"recent" | "archive" | "pruned">()` — nullable
  - `curator_run_id: text()` — nullable traceability metadata

### Steps

- [ ] **8.1** Open `packages/opencode/src/session/session.sql.ts` and add `cron_job_id` to `SessionTable`.

  Locate the `SessionTable` definition. The last field before `...Timestamps` spread is `model`. Add `cron_job_id` as the last named field before the closing `...Timestamps`:

  Find this block:
  ```typescript
      model: text({ mode: "json" }).$type<{
        id: string
        providerID: string
        variant?: string
      }>(),
      ...Timestamps,
      time_compacting: integer(),
      time_archived: integer(),
  ```

  Replace with:
  ```typescript
      model: text({ mode: "json" }).$type<{
        id: string
        providerID: string
        variant?: string
      }>(),
      ...Timestamps,
      time_compacting: integer(),
      time_archived: integer(),
      /** ID of the cron job that spawned this session, null if human-initiated */
      cron_job_id: text().$type<SessionID>(),
  ```

- [ ] **8.2** Add `compressed` and `memory_tier` to `MessageTable`.

  Locate the `MessageTable` definition. The `data` field is the last named field before the closing `}`:

  Find this block:
  ```typescript
      data: text({ mode: "json" }).notNull().$type<InfoData>(),
  ```

  Replace with:
  ```typescript
      data: text({ mode: "json" }).notNull().$type<InfoData>(),
      /** 1 if this message was compressed by the context compression pipeline, 0 otherwise */
      compressed: integer().default(0),
      /** Curator-assigned memory tier; null until classified */
      memory_tier: text().$type<"recent" | "archive" | "pruned">(),
      /** CuratorRunTable.id that classified this message; null until classified */
      curator_run_id: text(),
  ```

- [ ] **8.3** Verify the full file compiles:
  ```bash
  cd packages/opencode && bun typecheck 2>&1 | Select-String "session.sql"
  ```
  Expected: no lines mentioning `session.sql`.

- [ ] **8.4** Re-run the integration test to confirm the new Drizzle schema aligns with the migration:
  ```bash
  bun test packages/opencode/test/storage/intelligence-tables.test.ts --timeout 15000
  ```
  Expected: `22 pass, 0 fail` (same as before — the test already exercises these columns).

- [ ] **8.5** Run the existing session schema tests to confirm no regressions:
  ```bash
  bun test packages/opencode/test/session/session-schema.test.ts --timeout 15000
  ```
  Expected: all existing tests pass.

- [ ] **8.6** Commit:
  ```bash
  git add packages/opencode/src/session/session.sql.ts
  git commit -m "feat(db): add cron_job_id/compressed/memory_tier columns to session+message Drizzle schema"
  ```

---

## Completion Checklist

After both commits land, verify:

- [ ] `packages/opencode/migration/20260519000000_add_intelligence_tables/migration.sql` exists
- [ ] `ls packages/opencode/migration` shows `20260519000000_add_intelligence_tables` as the last entry
- [ ] `bun test packages/opencode/test/storage/intelligence-tables.test.ts --timeout 15000` — 22 pass, 0 fail
- [ ] `bun test packages/opencode/test/session/session-schema.test.ts --timeout 15000` — all pass
- [ ] `bun typecheck` (from `packages/opencode`) — no errors in any of the new `*.sql.ts` files
- [ ] All 5 new schema files export their table constants with correct Drizzle types
- [ ] `SessionTable` has `cron_job_id` column
- [ ] `MessageTable` has `compressed` and `memory_tier` columns

## What Other Plans Depend On

| Plan | Tables Used |
|------|------------|
| Plan 2: Intelligence Router | `router_outcomes` |
| Plan 3: Memory Curator + Vector | `memory_archive`, `curator_runs`, `vector_embeddings` |
| Plan 4: Knowledge Graph | `graph_nodes`, `graph_edges` |
| Plan 5: Cron Scheduler | `cron_jobs`, `session.cron_job_id` |
| All plans | `message.compressed`, `message.memory_tier` |

No other plan should begin implementing service logic until this plan's final commit is on the branch.
