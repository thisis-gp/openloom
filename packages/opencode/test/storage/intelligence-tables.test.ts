/**
 * Integration test: verifies all intelligence/memory/cron tables were created
 * by migration 20260519000000_add_intelligence_tables.
 */
import { describe, expect, test } from "bun:test"
import { Database } from "@/storage/db"
import { RouterOutcomeTable } from "@/intelligence/router/router.sql"
import { MemoryArchiveTable, CuratorRunTable } from "@/memory/curator/curator.sql"
import { VectorEmbeddingTable } from "@/memory/vector/vector.sql"
import { GraphNodeTable, GraphEdgeTable } from "@/memory/graph/graph.sql"
import { CronJobTable } from "@/cron/cron.sql"
import { SessionTable, MessageTable } from "@/session/session.sql"
import { ProjectTable } from "@/project/project.sql"
import { eq } from "drizzle-orm"
import { ProjectID } from "@/project/schema"
import { SessionID, MessageID } from "@/session/schema"
import type { MessageV2 } from "@/session/message-v2"
import { ProviderID, ModelID } from "@/provider/schema"

const SESSION_ID = "ses_test_intel_001" as SessionID
const PROJECT_ID = "proj_test_intel_001" as ProjectID

function seedProjectAndSession() {
  const now = Date.now()
  Database.use((db) => {
    db.insert(ProjectTable)
      .values({
        id: PROJECT_ID,
        worktree: "/tmp/test",
        sandboxes: [],
        time_created: now,
        time_updated: now,
      })
      .onConflictDoNothing()
      .run()

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
        time_created: now,
        time_updated: now,
      })
      .onConflictDoNothing()
      .run()
  })
}

describe("intelligence tables — schema migration", () => {
  test("seeds project and session rows", () => {
    expect(() => seedProjectAndSession()).not.toThrow()
  })

  describe("router_outcomes", () => {
    test("inserts and reads RouterOutcome row", () => {
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
      const rows = Database.use((db) =>
        db.select().from(RouterOutcomeTable).where(eq(RouterOutcomeTable.model_id, "gpt-4o")).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.provider_id).toBe("openai")
      expect(rows[0]!.alpha).toBe(3.0)
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

  describe("curator_runs", () => {
    test("inserts and reads CuratorRun row", () => {
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
      const rows = Database.use((db) => db.select().from(CuratorRunTable).where(eq(CuratorRunTable.id, "run_001")).all())
      expect(rows[0]!.trigger).toBe("message_threshold")
    })
  })

  describe("memory_archive", () => {
    test("inserts and reads MemoryArchive row", () => {
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
      const rows = Database.use((db) =>
        db.select().from(MemoryArchiveTable).where(eq(MemoryArchiveTable.id, "arch_001")).all(),
      )
      expect(rows[0]!.embedding_id).toBeNull()
    })
  })

  describe("vector_embeddings", () => {
    test("inserts VectorEmbedding and updates archive back-reference", () => {
      const now = Date.now()
      const vector = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
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

  describe("graph_nodes and graph_edges", () => {
    test("inserts graph nodes and edges", () => {
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
      const edges = Database.use((db) =>
        db.select().from(GraphEdgeTable).where(eq(GraphEdgeTable.id, "edge_001")).all(),
      )
      expect(edges[0]!.relation).toBe("references")
    })
  })

  describe("cron_jobs", () => {
    test("inserts and reads CronJob row", () => {
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
            running_session_id: null,
            last_error: null,
            run_count: 0,
            time_created: now,
            time_updated: now,
          })
          .run()
      })
      const rows = Database.use((db) => db.select().from(CronJobTable).where(eq(CronJobTable.id, "cron_001")).all())
      expect(rows[0]!.last_run).toBeNull()
      expect(rows[0]!.enabled).toBe(1)
    })
  })

  describe("session table — new columns", () => {
    test("cron_job_id column exists and defaults to null", () => {
      const rows = Database.use((db) =>
        db
          .select({ id: SessionTable.id, cron_job_id: SessionTable.cron_job_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, SESSION_ID))
          .all(),
      )
      expect(rows[0]!.cron_job_id).toBeNull()
    })
  })

  describe("message table — new columns", () => {
    test("compressed and memory_tier columns round-trip", () => {
      const now = Date.now()
      const msgID = "msg_001" as MessageID
      Database.use((db) => {
        db.insert(MessageTable)
          .values({
            id: msgID,
            session_id: SESSION_ID,
            data: {
              role: "user",
              id: msgID,
              sessionID: SESSION_ID,
              time: { created: now },
              agent: "build",
              model: { providerID: ProviderID.make("anthropic"), modelID: ModelID.make("claude-sonnet-4-6") },
            } satisfies MessageV2.User as MessageV2.Info,
            compressed: 0,
            memory_tier: null,
            curator_run_id: null,
            time_created: now,
            time_updated: now,
          })
          .run()
        db.update(MessageTable)
          .set({ compressed: 1, memory_tier: "archive", curator_run_id: "run_001" })
          .where(eq(MessageTable.id, msgID))
          .run()
      })
      const rows = Database.use((db) => db.select().from(MessageTable).where(eq(MessageTable.id, msgID)).all())
      expect(rows[0]!.compressed).toBe(1)
      expect(rows[0]!.memory_tier).toBe("archive")
      expect(rows[0]!.curator_run_id).toBe("run_001")
    })
  })
})
