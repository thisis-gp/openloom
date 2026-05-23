import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@/storage/db"
import { CuratorService } from "@/memory/curator/curator"
import { testCuratorLayer } from "./curator-layer"
import { MessageV2 } from "@/session/message-v2"
import { MessageTable, PartTable, SessionTable } from "@/session/session.sql"
import { PartID } from "@/session/schema"
import { ProjectTable } from "@/project/project.sql"
import { ProjectID } from "@/project/schema"
import { MessageID, SessionID } from "@/session/schema"
import { ProviderID, ModelID } from "@/provider/schema"
import { testEffect } from "../lib/effect"

const PROJECT_ID = "proj_curator_test" as ProjectID
const SESSION_ID = "ses_curator_test" as SessionID

const it = testEffect(testCuratorLayer)

function seedSession() {
  const now = Date.now()
  Database.use((db) => {
    db.insert(ProjectTable)
      .values({
        id: PROJECT_ID,
        worktree: "/tmp/curator-test",
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
        slug: "curator-test",
        directory: "/tmp/curator-test",
        title: "Curator test",
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

function seedMessage(id: string, text: string) {
  const now = Date.now()
  const messageID = id as MessageID
  Database.use((db) => {
    db.insert(MessageTable)
      .values({
        id: messageID,
        session_id: SESSION_ID,
        data: {
          id: messageID,
          sessionID: SESSION_ID,
          role: "user",
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
    db.insert(PartTable)
      .values({
        id: PartID.ascending(),
        session_id: SESSION_ID,
        message_id: messageID,
        data: { type: "text" as const, text } as Omit<MessageV2.TextPart, "id" | "sessionID" | "messageID">,
        time_created: now,
        time_updated: now,
      })
      .run()
  })
}

describe("memory.curator", () => {
  test("shouldRun returns false when fewer than 20 unprocessed messages", () => {
    seedSession()
    seedMessage("msg_curator_1", "short message")
    const result = Effect.runSync(
      Effect.gen(function* () {
        const curator = yield* CuratorService.Service
        return yield* curator.shouldRun(SESSION_ID)
      }).pipe(Effect.provide(testCuratorLayer)),
    )
    expect(result).toBe(false)
  })

  it.live("run classifies a session_end trigger", () =>
    Effect.gen(function* () {
      seedSession()
      seedMessage("msg_curator_end", "We decided to adopt the new router design for all agents.")
      const curator = yield* CuratorService.Service
      const result = yield* curator.run({ sessionID: SESSION_ID, trigger: "session_end" })
      expect(result.classified).toBeGreaterThanOrEqual(1)
    }),
    10_000,
  )
})
