# Memory Stack: Curator + Vector Index + Knowledge Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-tier memory system: curator archives important messages, vector index enables semantic search, knowledge graph maps entity relationships across sessions.

**Architecture:** Three memory services in `src/memory/`. CuratorService hooks into the Session message pipeline via BackgroundJob after each message save and on session end. VectorService indexes archived content through OpenLoom's provider/auth/config path, not raw OpenAI environment variables. GraphService extracts entities via the existing provider path and computes graph importance. Vector and Graph are triggered after each curator archival pass. A new `memory_graph` tool and an updated `session_search` semantic mode expose these to the agent.

**Tech Stack:** Effect, Drizzle ORM, SQLite, Vercel AI SDK (`embed`), TypeScript, Bun

**Depends on:** Plan 1 (Foundation) must be applied first — requires `MemoryArchiveTable`, `CuratorRunTable`, `VectorEmbeddingTable`, `GraphNodeTable`, `GraphEdgeTable`, and `message.memory_tier` column on `MessageTable`.

---

## Implementation Corrections

These corrections supersede stale snippets below:

- This plan is a memory curator, not the same as Hermes' skill curator. Use Hermes mainly for compression, cron isolation, and safety patterns.
- Do not call `fetch("https://api.openai.com/v1/embeddings")` or read `OPENAI_API_KEY` directly. Use OpenLoom's provider/auth/config path or add a small embedding provider abstraction that follows the existing Provider conventions.
- HNSW is the target backend, but the first implementation may ship flat cosine search only if it is explicitly labeled as an MVP fallback. Do not name a file `hnsw.ts` if it only contains flat search.
- Avoid `any`, placeholder query code, and N+1 message/part reads. Use Drizzle helpers such as `inArray` and batch hydrate parts similarly to `session_search`.
- Do not call `Effect.provide(CuratorService.defaultLayer)` inside daemon fibers. Background jobs should use services from the app/instance layer so they share lifecycle, project, provider, and permission context.
- Add idempotency: archive creation, vector embedding, node extraction, and edge extraction should tolerate reruns without duplicate rows.
- Knowledge graph MVP should either implement label propagation/community detection or remove that promise from the plan until a later phase.

## File Map

```
packages/opencode/src/memory/
  curator/
    curator.ts           ← CuratorService Effect Layer
  vector/
    flat.ts              ← cosineSimilarity + flat vector search MVP fallback
    hnsw.ts              ← optional HNSW backend when available
    vector.ts            ← VectorService Effect Layer
  graph/
    extractor.ts         ← entity extraction helper (LLM call)
    graph.ts             ← GraphService Effect Layer
    graph-tool.ts        ← MemoryGraphTool tool definition
    memory_graph.txt     ← tool description prompt

packages/opencode/src/tool/
  session_search.ts      ← modified: add semantic search mode

packages/opencode/src/session/
  session.ts             ← modified: hook curator after message save + session end
  session.sql.ts         ← already modified in Plan 1 (memory_tier column)

packages/opencode/test/memory/
  curator.test.ts
  vector.test.ts
  graph.test.ts
```

---

## Task 1: CuratorService — shouldRun and run

**Files:**
- Create: `packages/opencode/src/memory/curator/curator.ts`
- Test: `packages/opencode/test/memory/curator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/opencode/test/memory/curator.test.ts
import { CrossSpawnSpawner } from "@openloom/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import { CuratorService } from "@/memory/curator/curator"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ProviderID, ModelID } from "@/provider/schema"
import { Database, isNull, eq } from "@/storage/db"
import { MessageTable } from "@/session/session.sql"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(CuratorService.defaultLayer, Session.defaultLayer, CrossSpawnSpawner.defaultLayer),
)

afterEach(async () => {
  await disposeAllInstances()
})

describe("memory.curator", () => {
  it.live("shouldRun returns false when fewer than 20 unprocessed messages", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ title: "Test", agent: "build" })
        const curator = yield* CuratorService.Service

        const result = yield* curator.shouldRun(session.id)
        expect(result).toBe(false)
      }),
    { git: true }),
    15_000,
  )

  it.live("shouldRun returns true when 20+ unprocessed messages exist", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ title: "Test", agent: "build" })
        const curator = yield* CuratorService.Service

        // Insert 20 messages with null memory_tier
        for (let i = 0; i < 20; i++) {
          const msgID = MessageID.ascending()
          yield* sessions.updateMessage({
            id: msgID,
            sessionID: session.id,
            role: "user",
            time: { created: Date.now() + i },
            agent: "build",
            model: { providerID: ProviderID.make("anthropic"), modelID: ModelID.make("claude-sonnet-4-6") },
          })
        }

        const result = yield* curator.shouldRun(session.id)
        expect(result).toBe(true)
      }),
    { git: true }),
    15_000,
  )

  it.live("run returns classified count and nudge text", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ title: "Test", agent: "build" })
        const curator = yield* CuratorService.Service

        // Add a message with text part
        const msgID = MessageID.ascending()
        yield* sessions.updateMessage({
          id: msgID,
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("anthropic"), modelID: ModelID.make("claude-sonnet-4-6") },
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: msgID,
          type: "text",
          text: "We decided to use SQLite for the memory system.",
        })

        const result = yield* curator.run({ sessionID: session.id, trigger: "session_end" })
        expect(result.classified).toBeGreaterThan(0)
        expect(typeof result.nudgeText).toBe("string")
      }),
    { git: true }),
    30_000,
  )
})
```

- [ ] **Step 2: Run test to confirm it fails**

```
bun test packages/opencode/test/memory/curator.test.ts --timeout 30000
```

Expected: FAIL — `Cannot find module '@/memory/curator/curator'`

- [ ] **Step 3: Create `src/memory/curator/curator.ts`**

```typescript
import { Effect, Layer, Context } from "effect"
import { isNull, eq, and, desc, inArray } from "drizzle-orm"
import { Database } from "@/storage/db"
import { MessageTable, PartTable } from "@/session/session.sql"
import { MemoryArchiveTable, CuratorRunTable } from "./curator.sql"
import { SessionID } from "@/session/schema"
import * as Log from "@openloom/core/util/log"
import { BackgroundJob } from "@/background/job"

const log = Log.create({ service: "memory.curator" })

const THRESHOLD = 20
const RECENT_KEEP = 50

function getMessageText(parts: Array<{ type: string; data: any }>): string {
  return parts
    .filter((p) => p.type === "text" || p.type === "reasoning")
    .map((p) => (p.data as { text?: string }).text ?? "")
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000)
}

export interface Interface {
  readonly shouldRun: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly run: (input: {
    sessionID: SessionID
    trigger: "message_threshold" | "session_end"
  }) => Effect.Effect<{ classified: number; archived: number; pruned: number; nudgeText: string }>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/CuratorService") {}

export const layer: Layer.Layer<Service, never, BackgroundJob.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      shouldRun: (sessionID) =>
        Effect.sync(() => {
          const count = Database.use((db) =>
            db
              .select({ id: MessageTable.id })
              .from(MessageTable)
              .where(and(eq(MessageTable.session_id, sessionID), isNull(MessageTable.memory_tier)))
              .all(),
          ).length
          return count >= THRESHOLD
        }),

      run: ({ sessionID, trigger }) =>
        Effect.gen(function* () {
          const runID = crypto.randomUUID()

          const unprocessed = Database.use((db) =>
            db
              .select()
              .from(MessageTable)
              .where(and(eq(MessageTable.session_id, sessionID), isNull(MessageTable.memory_tier)))
              .orderBy(MessageTable.time_created)
              .all(),
          )

          if (unprocessed.length === 0) {
            return { classified: 0, archived: 0, pruned: 0, nudgeText: "" }
          }

          // Hydrate parts for all messages in one query.
          const msgIDs = unprocessed.map((m) => m.id)
          const allParts = Database.use((db) =>
            db.select().from(PartTable).where(inArray(PartTable.message_id, msgIDs)).all(),
          )
          const partsByMsg = new Map(
            msgIDs.map((msgID) => [
              msgID,
              allParts
                .filter((part) => part.message_id === msgID)
                .map((part) => ({ type: (part.data as any).type ?? "text", data: part.data })),
            ]),
          )

          // Classify: heuristic-first (no LLM call for speed)
          // A message is "important" if its text contains decision/code/error signals
          const importantSignals = /decid|implement|fix|error|bug|creat|add|remov|updat|schema|migrat|deploy|configur/i
          const classified: Array<{ id: string; importance: "important" | "routine"; text: string }> = []

          for (const msg of unprocessed) {
            const parts = partsByMsg.get(msg.id) ?? []
            const text = getMessageText(parts)
            const importance: "important" | "routine" = importantSignals.test(text) ? "important" : "routine"
            classified.push({ id: msg.id, importance, text })
          }

          const importantIDs = classified.filter((c) => c.importance === "important").map((c) => c.id)
          const routineIDs = classified.filter((c) => c.importance === "routine").map((c) => c.id)

          // Archive important messages
          for (const item of classified.filter((c) => c.importance === "important")) {
            Database.use((db) =>
              db
                .insert(MemoryArchiveTable)
                .values({
                  id: crypto.randomUUID(),
                  session_id: sessionID,
                  message_id: item.id,
                  tier: "archive",
                  importance: "important",
                  content: item.text,
                  curator_run_id: runID,
                })
                .run(),
            )
            Database.use((db) =>
              db
                .update(MessageTable)
                .set({ memory_tier: "archive" })
                .where(eq(MessageTable.id, item.id))
                .run(),
            )
          }

          // Keep last RECENT_KEEP routine messages as "recent", prune the rest
          const recentMessages = Database.use((db) =>
            db
              .select({ id: MessageTable.id })
              .from(MessageTable)
              .where(and(eq(MessageTable.session_id, sessionID), isNull(MessageTable.memory_tier)))
              .orderBy(desc(MessageTable.time_created))
              .limit(RECENT_KEEP)
              .all(),
          ).map((r) => r.id)
          const recentSet = new Set(recentMessages)

          let pruned = 0
          for (const item of classified.filter((c) => c.importance === "routine")) {
            if (recentSet.has(item.id)) {
              Database.use((db) =>
                db.update(MessageTable).set({ memory_tier: "recent" }).where(eq(MessageTable.id, item.id)).run(),
              )
            } else {
              Database.use((db) =>
                db
                  .insert(MemoryArchiveTable)
                  .values({
                    id: crypto.randomUUID(),
                    session_id: sessionID,
                    message_id: item.id,
                    tier: "pruned",
                    importance: "routine",
                    content: item.text.slice(0, 200),
                    curator_run_id: runID,
                  })
                  .run(),
              )
              Database.use((db) =>
                db.update(MessageTable).set({ memory_tier: "pruned" }).where(eq(MessageTable.id, item.id)).run(),
              )
              pruned++
            }
          }

          // Write curator run record
          Database.use((db) =>
            db
              .insert(CuratorRunTable)
              .values({
                id: runID,
                session_id: sessionID,
                trigger,
                messages_classified: unprocessed.length,
                messages_archived: importantIDs.length,
                messages_pruned: pruned,
              })
              .run(),
          )

          const archivedItems = classified.filter((c) => c.importance === "important")
          const nudgeText =
            archivedItems.length > 0
              ? `Remembered ${archivedItems.length} important message(s) from this session covering: ${archivedItems
                  .map((a) => a.text.slice(0, 80))
                  .join("; ")
                  .slice(0, 300)}.`
              : ""

          log.info("curator run complete", {
            sessionID,
            trigger,
            classified: unprocessed.length,
            archived: importantIDs.length,
            pruned,
          })

          return { classified: unprocessed.length, archived: importantIDs.length, pruned, nudgeText }
        }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(BackgroundJob.defaultLayer))

export * as CuratorService from "./curator"
```

- [ ] **Step 4: Create `src/memory/curator/curator.sql.ts`** (if Plan 1 hasn't already)

Verify Plan 1 created this file. If not, create it:

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@/session/session.sql"
import { Timestamps } from "@/storage/schema.sql"
import type { SessionID } from "@/session/schema"

export const MemoryArchiveTable = sqliteTable(
  "memory_archive",
  {
    id: text().primaryKey(),
    session_id: text().$type<SessionID>().notNull().references(() => SessionTable.id, { onDelete: "cascade" }),
    message_id: text().notNull(),
    tier: text().$type<"archive" | "pruned">().notNull(),
    importance: text().$type<"important" | "routine">().notNull(),
    content: text().notNull(),
    embedding_id: text(),
    curator_run_id: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("memory_archive_session_idx").on(table.session_id),
    index("memory_archive_tier_idx").on(table.tier),
  ],
)

export const CuratorRunTable = sqliteTable(
  "curator_runs",
  {
    id: text().primaryKey(),
    session_id: text().$type<SessionID>().notNull(),
    trigger: text().$type<"message_threshold" | "session_end">().notNull(),
    messages_classified: integer().notNull().default(0),
    messages_archived: integer().notNull().default(0),
    messages_pruned: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [index("curator_runs_session_idx").on(table.session_id)],
)
```

- [ ] **Step 5: Run tests**

```
bun test packages/opencode/test/memory/curator.test.ts --timeout 30000
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/opencode/src/memory/curator/ packages/opencode/test/memory/curator.test.ts
git commit -m "feat: add CuratorService — heuristic message classification and archival"
```

---

## Task 2: Wire Curator into Session Pipeline

**Files:**
- Modify: `packages/opencode/src/session/session.ts`

- [ ] **Step 1: Find the message-save hook point**

In `src/session/session.ts`, find the location where a message part is finalized after an assistant turn. Search for `updatePart` or where `background.run` is called after message completion. This is the integration point.

- [ ] **Step 2: Add curator import and hook**

At the top of `session.ts`, add:

```typescript
import { CuratorService } from "@/memory/curator/curator"
```

Find the point where an assistant message is fully written (after `updateMessage` with `finish` field set). Add:

```typescript
// After the message is finalized, check if curator should run.
// Use the service from the current app/instance layer; do not provide a fresh
// CuratorService layer inside the daemon fiber.
yield* Effect.forkDaemon(
  Effect.gen(function* () {
    const curator = yield* CuratorService.Service
    const needsRun = yield* curator.shouldRun(sessionID)
    if (needsRun) {
      const result = yield* curator.run({ sessionID, trigger: "message_threshold" })
      if (result.nudgeText) {
        log.info("curator nudge", { sessionID, nudge: result.nudgeText })
      }
    }
  }).pipe(Effect.orElse(() => Effect.void)),
)
```

Find the session end/archive point (where `time_archived` is set). Add:

```typescript
yield* Effect.forkDaemon(
  Effect.gen(function* () {
    const curator = yield* CuratorService.Service
    yield* curator.run({ sessionID, trigger: "session_end" })
  }).pipe(Effect.orElse(() => Effect.void)),
)
```

- [ ] **Step 3: Run existing session tests to confirm no regression**

```
bun test packages/opencode/test/session/ --timeout 30000
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/session/session.ts
git commit -m "feat: hook CuratorService into session message pipeline and session end"
```

---

## Task 3: Vector Index — flat MVP + optional HNSW backend

**Files:**
- Create: `packages/opencode/src/memory/vector/flat.ts`
- Optional later: `packages/opencode/src/memory/vector/hnsw.ts`
- Create: `packages/opencode/src/memory/vector/vector.ts`
- Create: `packages/opencode/src/memory/vector/vector.sql.ts`
- Test: `packages/opencode/test/memory/vector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/opencode/test/memory/vector.test.ts
import { Effect, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import { cosineSimilarity } from "@/memory/vector/flat"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

afterEach(async () => {
  await disposeAllInstances()
})

describe("memory.vector.flat", () => {
  it.effect("cosineSimilarity returns 1.0 for identical vectors", () =>
    Effect.gen(function* () {
      const a = [1, 0, 0]
      const b = [1, 0, 0]
      const score = cosineSimilarity(a, b)
      expect(score).toBeCloseTo(1.0, 5)
    }),
  )

  it.effect("cosineSimilarity returns 0.0 for orthogonal vectors", () =>
    Effect.gen(function* () {
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      const score = cosineSimilarity(a, b)
      expect(score).toBeCloseTo(0.0, 5)
    }),
  )

  it.effect("cosineSimilarity returns -1.0 for opposite vectors", () =>
    Effect.gen(function* () {
      const a = [1, 0]
      const b = [-1, 0]
      const score = cosineSimilarity(a, b)
      expect(score).toBeCloseTo(-1.0, 5)
    }),
  )
})
```

- [ ] **Step 2: Run test to confirm it fails**

```
bun test packages/opencode/test/memory/vector.test.ts --timeout 15000
```

Expected: FAIL — `Cannot find module '@/memory/vector/flat'`

- [ ] **Step 3: Create `src/memory/vector/flat.ts`**

```typescript
/**
 * Flat vector search with cosine similarity.
 * O(n) scan — sufficient for <10,000 archived messages.
 * MVP fallback. Add a separate HNSW backend when the archive is large enough
 * to justify the extra dependency/runtime complexity.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom < 1e-8) return 0
  return dot / denom
}

export function topK(
  query: number[],
  entries: Array<{ id: string; vector: number[] }>,
  k: number,
): Array<{ id: string; score: number }> {
  return entries
    .map((e) => ({ id: e.id, score: cosineSimilarity(query, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
```

- [ ] **Step 4: Run vector search tests**

```
bun test packages/opencode/test/memory/vector.test.ts --timeout 15000
```

Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/memory/vector/vector.sql.ts`**

```typescript
import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import type { SessionID } from "@/session/schema"

export const VectorEmbeddingTable = sqliteTable(
  "vector_embeddings",
  {
    id: text().primaryKey(),
    archive_id: text().notNull(),
    session_id: text().$type<SessionID>().notNull(),
    model: text().notNull(),
    vector: text({ mode: "json" }).notNull().$type<number[]>(),
    ...Timestamps,
  },
  (table) => [index("vector_embeddings_session_idx").on(table.session_id)],
)
```

- [ ] **Step 6: Create `src/memory/vector/vector.ts`**

```typescript
import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { VectorEmbeddingTable } from "./vector.sql"
import { MemoryArchiveTable } from "@/memory/curator/curator.sql"
import { SessionID } from "@/session/schema"
import { topK } from "./flat"
import { Provider } from "@/provider/provider"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "memory.vector" })

// Implement this through OpenLoom provider/auth/config conventions.
// It should return null when no embedding provider is configured so session_search
// can fall back to LIKE search without breaking the active session.
const generateEmbedding = (text: string) =>
  Effect.gen(function* () {
    const provider = yield* Provider.Provider
    return yield* provider.embed?.({ input: text.slice(0, 8_000) }) ?? null
  })

export interface Interface {
  readonly index: (input: {
    archiveID: string
    sessionID: SessionID
    content: string
  }) => Effect.Effect<string | null>

  readonly search: (input: {
    query: string
    limit: number
  }) => Effect.Effect<Array<{ archiveID: string; sessionID: SessionID; score: number }>>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/VectorService") {}

export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      index: ({ archiveID, sessionID, content }) =>
        Effect.gen(function* () {
          const vector = yield* Effect.promise(() => generateEmbedding(content))
          if (!vector) return null

          const id = crypto.randomUUID()
          Database.use((db) =>
            db
              .insert(VectorEmbeddingTable)
              .values({ id, archive_id: archiveID, session_id: sessionID, model: EMBEDDING_MODEL, vector })
              .run(),
          )

          // Link embedding back to archive entry
          Database.use((db) =>
            db.update(MemoryArchiveTable).set({ embedding_id: id }).where(eq(MemoryArchiveTable.id, archiveID)).run(),
          )

          return id
        }),

      search: ({ query, limit }) =>
        Effect.gen(function* () {
          const queryVector = yield* Effect.promise(() => generateEmbedding(query))
          if (!queryVector) return []

          const allEmbeddings = Database.use((db) =>
            db.select().from(VectorEmbeddingTable).all(),
          )

          const results = topK(
            queryVector,
            allEmbeddings.map((e) => ({ id: e.id, vector: e.vector })),
            limit,
          )

          return results.map((r) => {
            const embedding = allEmbeddings.find((e) => e.id === r.id)!
            return {
              archiveID: embedding.archive_id,
              sessionID: embedding.session_id as SessionID,
              score: r.score,
            }
          })
        }),
    })
  }),
)

export const defaultLayer = layer

export * as VectorService from "./vector"
```

- [ ] **Step 7: Run all vector tests**

```
bun test packages/opencode/test/memory/vector.test.ts --timeout 15000
```

Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add packages/opencode/src/memory/vector/ packages/opencode/test/memory/vector.test.ts
git commit -m "feat: add VectorService with flat cosine similarity search and OpenAI embeddings"
```

---

## Task 4: Update session_search for Semantic Mode

**Files:**
- Modify: `packages/opencode/src/tool/session_search.ts`

- [ ] **Step 1: Add `semantic` parameter to Parameters**

In `src/tool/session_search.ts`, update the Parameters Schema:

```typescript
const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({
    description: "Search query. When provided, session_search returns matching past messages.",
  }),
  semantic: Schema.optional(Schema.Boolean).annotate({
    description: "Use semantic (vector) search instead of keyword matching. Requires query. Default: false.",
  }),
  session_id: Schema.optional(SessionID).annotate({
    description: "Session id to scroll. Must be paired with around_message_id.",
  }),
  around_message_id: Schema.optional(MessageID).annotate({
    description: "Message id to center the scroll window around. Must be paired with session_id.",
  }),
  window: Schema.optional(NonNegativeInt).annotate({
    description: "Number of messages before and after around_message_id to return. Defaults to 5, max 20.",
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "Maximum number of sessions or matches to return. Defaults to 5, max 20.",
  }),
})
```

- [ ] **Step 2: Add semantic search branch**

Inside the `run` function, after `if (params.query?.trim())`, add a semantic branch:

```typescript
if (params.semantic && params.query?.trim()) {
  // Attempt semantic search via VectorService
  const vectorOpt = yield* Effect.serviceOption(VectorService.Service)
  if (Option.isSome(vectorOpt)) {
    const matches = yield* vectorOpt.value.search({ query: params.query, limit: limit * 3 })
    if (matches.length > 0) {
      const seen = new Set<string>()
      const results = []
      for (const match of matches) {
        const root = rootSessionID(match.sessionID)
        if (root === currentRoot) continue
        if (seen.has(root)) continue
        seen.add(root)
        const session = getSession(root)
        if (!session) continue
        const edges = bookends(root)
        results.push({
          session_id: root,
          title: session.title,
          path: session.path,
          agent: session.agent,
          created_at: session.time_created,
          updated_at: session.time_updated,
          similarity_score: match.score,
          bookend_start: edges.start,
          bookend_end: edges.end,
        })
        if (results.length >= limit) break
      }
      if (results.length > 0) {
        return {
          title: "Semantic session search",
          metadata: { mode: "semantic", query: params.query, count: results.length, session_id: "", around_message_id: "" },
          output: JSON.stringify({ success: true, mode: "semantic", query: params.query, results }, null, 2),
        }
      }
      // Fall through to LIKE search if no semantic results
    }
  }
}
```

Add the import at the top of `session_search.ts`:

```typescript
import { VectorService } from "@/memory/vector/vector"
import * as Option from "effect/Option"
```

- [ ] **Step 3: Run existing session_search tests**

```
bun test packages/opencode/test/tool/session_search.test.ts --timeout 15000
```

Expected: PASS — existing tests still pass, semantic mode is optional

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/tool/session_search.ts
git commit -m "feat: add semantic search mode to session_search tool via VectorService"
```

---

## Task 5: Knowledge Graph — extractor, GraphService, graph-tool

**Files:**
- Create: `packages/opencode/src/memory/graph/extractor.ts`
- Create: `packages/opencode/src/memory/graph/graph.sql.ts`
- Create: `packages/opencode/src/memory/graph/graph.ts`
- Create: `packages/opencode/src/memory/graph/graph-tool.ts`
- Create: `packages/opencode/src/memory/graph/memory_graph.txt`
- Test: `packages/opencode/test/memory/graph.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/opencode/test/memory/graph.test.ts
import { Effect, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import { extractEntities } from "@/memory/graph/extractor"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

afterEach(async () => {
  await disposeAllInstances()
})

describe("memory.graph.extractor", () => {
  it.effect("extracts file path entities from text", () =>
    Effect.gen(function* () {
      const text = "We modified src/session/session.ts to add the parent_id column."
      const result = extractEntities(text)
      const fileEntities = result.entities.filter((e) => e.type === "file")
      expect(fileEntities.length).toBeGreaterThan(0)
      expect(fileEntities.some((e) => e.label.includes("session.ts"))).toBe(true)
    }),
  )

  it.effect("extracts decision entities from text", () =>
    Effect.gen(function* () {
      const text = "We decided to use SQLite for the memory system instead of PostgreSQL."
      const result = extractEntities(text)
      const decisions = result.entities.filter((e) => e.type === "decision")
      expect(decisions.length).toBeGreaterThan(0)
    }),
  )

  it.effect("returns empty arrays for short unstructured text", () =>
    Effect.gen(function* () {
      const text = "ok"
      const result = extractEntities(text)
      expect(result.entities.length).toBe(0)
    }),
  )
})
```

- [ ] **Step 2: Run test to confirm it fails**

```
bun test packages/opencode/test/memory/graph.test.ts --timeout 15000
```

Expected: FAIL — `Cannot find module '@/memory/graph/extractor'`

- [ ] **Step 3: Create `src/memory/graph/extractor.ts`**

```typescript
/**
 * Heuristic entity extractor — no LLM call, zero latency.
 * Uses regex patterns to find files, functions, decisions, concepts.
 * Good enough for knowledge graph bootstrapping; can be replaced with LLM later.
 */

export type EntityType = "file" | "function" | "decision" | "concept"
export type RelationType = "references" | "modifies" | "decides" | "mentions" | "depends_on"

export interface Entity {
  type: EntityType
  label: string
}

export interface Relation {
  from: string
  to: string
  relation: RelationType
}

export interface ExtractionResult {
  entities: Entity[]
  relations: Relation[]
}

const FILE_PATTERN = /\b([\w/-]+\.(ts|tsx|js|jsx|py|go|sql|md|json|yaml|toml))\b/g
const FUNCTION_PATTERN = /\b([a-z][a-zA-Z0-9]+(?:Service|Tool|Layer|Table|Handler|Router|Store|Hook|Context))\b/g
const DECISION_PATTERN = /\b(decid(?:ed?|ing)|choos?(?:e|ing|es?)|opt(?:ed?|ing) for|us(?:e|ing) .{1,30} instead|replac(?:e|ing)|switch(?:ed?|ing) to)\b/gi
const CONCEPT_PATTERN = /\b(authentication|authorization|caching|pagination|migration|schema|routing|middleware|webhook|streaming)\b/gi

export function extractEntities(text: string): ExtractionResult {
  if (text.length < 10) return { entities: [], relations: [] }

  const entities: Entity[] = []
  const seen = new Set<string>()

  const addEntity = (type: EntityType, label: string) => {
    const key = `${type}:${label}`
    if (!seen.has(key) && entities.length < 15) {
      seen.add(key)
      entities.push({ type, label })
    }
  }

  // Files
  for (const match of text.matchAll(FILE_PATTERN)) {
    addEntity("file", match[1])
  }

  // Functions/Services/Tools
  for (const match of text.matchAll(FUNCTION_PATTERN)) {
    addEntity("function", match[1])
  }

  // Decisions — extract the sentence containing the decision signal
  for (const match of text.matchAll(DECISION_PATTERN)) {
    const start = Math.max(0, match.index! - 20)
    const end = Math.min(text.length, match.index! + 80)
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim()
    addEntity("decision", snippet.slice(0, 100))
  }

  // Concepts
  for (const match of text.matchAll(CONCEPT_PATTERN)) {
    addEntity("concept", match[1].toLowerCase())
  }

  // Build simple co-occurrence relations
  const relations: Relation[] = []
  const fileEntities = entities.filter((e) => e.type === "file")
  const funcEntities = entities.filter((e) => e.type === "function")

  for (const file of fileEntities) {
    for (const func of funcEntities) {
      relations.push({ from: func.label, to: file.label, relation: "references" })
    }
  }

  return { entities, relations }
}
```

- [ ] **Step 4: Run extractor tests**

```
bun test packages/opencode/test/memory/graph.test.ts --timeout 15000
```

Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/memory/graph/graph.sql.ts`**

```typescript
import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import type { SessionID } from "@/session/schema"

export const GraphNodeTable = sqliteTable(
  "graph_nodes",
  {
    id: text().primaryKey(),
    session_id: text().$type<SessionID>().notNull(),
    type: text().$type<"file" | "function" | "decision" | "concept">().notNull(),
    label: text().notNull(),
    pagerank_score: real().notNull().default(0.0),
    community_id: text(),
    ...Timestamps,
  },
  (table) => [
    index("graph_nodes_session_idx").on(table.session_id),
    index("graph_nodes_type_idx").on(table.type),
  ],
)

export const GraphEdgeTable = sqliteTable(
  "graph_edges",
  {
    id: text().primaryKey(),
    from_node_id: text().notNull(),
    to_node_id: text().notNull(),
    relation: text().$type<"references" | "modifies" | "decides" | "mentions" | "depends_on">().notNull(),
    weight: real().notNull().default(1.0),
    session_id: text().$type<SessionID>().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("graph_edges_from_idx").on(table.from_node_id),
    index("graph_edges_to_idx").on(table.to_node_id),
  ],
)
```

- [ ] **Step 6: Create `src/memory/graph/graph.ts`**

```typescript
import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { GraphNodeTable, GraphEdgeTable } from "./graph.sql"
import { SessionID } from "@/session/schema"
import { extractEntities } from "./extractor"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "memory.graph" })

function computePagerank(
  nodeIDs: string[],
  edges: Array<{ from: string; to: string; weight: number }>,
  iterations = 20,
  damping = 0.85,
): Map<string, number> {
  const n = nodeIDs.length
  if (n === 0) return new Map()
  const scores = new Map(nodeIDs.map((id) => [id, 1.0 / n]))
  for (let i = 0; i < iterations; i++) {
    const next = new Map(nodeIDs.map((id) => [id, (1 - damping) / n]))
    for (const edge of edges) {
      const outDegree = edges.filter((e) => e.from === edge.from).length
      if (outDegree > 0) {
        const contribution = (damping * (scores.get(edge.from) ?? 0) * edge.weight) / outDegree
        next.set(edge.to, (next.get(edge.to) ?? 0) + contribution)
      }
    }
    for (const [k, v] of next) scores.set(k, v)
  }
  return scores
}

export interface Interface {
  readonly ingest: (input: {
    archiveID: string
    sessionID: SessionID
    content: string
  }) => Effect.Effect<{ nodesAdded: number; edgesAdded: number }>

  readonly query: (input: {
    question: string
    limit?: number
  }) => Effect.Effect<
    Array<{
      node: { id: string; type: string; label: string; score: number }
      relatedNodes: Array<{ id: string; type: string; label: string; relation: string }>
    }>
  >

  readonly recomputePagerank: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/GraphService") {}

export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      ingest: ({ archiveID, sessionID, content }) =>
        Effect.gen(function* () {
          const { entities, relations } = extractEntities(content)
          let nodesAdded = 0
          let edgesAdded = 0

          const nodeIDMap = new Map<string, string>()

          for (const entity of entities) {
            // Deduplicate by label + type within session
            const existing = Database.use((db) =>
              db
                .select()
                .from(GraphNodeTable)
                .where(eq(GraphNodeTable.label, entity.label))
                .get(),
            )
            if (existing) {
              nodeIDMap.set(entity.label, existing.id)
            } else {
              const id = crypto.randomUUID()
              nodeIDMap.set(entity.label, id)
              Database.use((db) =>
                db
                  .insert(GraphNodeTable)
                  .values({ id, session_id: sessionID, type: entity.type, label: entity.label })
                  .run(),
              )
              nodesAdded++
            }
          }

          for (const rel of relations) {
            const fromID = nodeIDMap.get(rel.from)
            const toID = nodeIDMap.get(rel.to)
            if (!fromID || !toID) continue
            Database.use((db) =>
              db
                .insert(GraphEdgeTable)
                .values({ id: crypto.randomUUID(), from_node_id: fromID, to_node_id: toID, relation: rel.relation, session_id: sessionID })
                .run(),
            )
            edgesAdded++
          }

          log.info("graph ingest", { sessionID, nodesAdded, edgesAdded })
          return { nodesAdded, edgesAdded }
        }),

      query: ({ question, limit = 10 }) =>
        Effect.sync(() => {
          // Keyword match on node labels
          const terms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
          const allNodes = Database.use((db) => db.select().from(GraphNodeTable).all())
          const matched = allNodes
            .filter((node) => terms.some((t) => node.label.toLowerCase().includes(t)))
            .sort((a, b) => b.pagerank_score - a.pagerank_score)
            .slice(0, limit)

          return matched.map((node) => {
            const edges = Database.use((db) =>
              db.select().from(GraphEdgeTable).where(eq(GraphEdgeTable.from_node_id, node.id)).all(),
            )
            const relatedNodes = edges
              .map((edge) => {
                const related = Database.use((db) =>
                  db.select().from(GraphNodeTable).where(eq(GraphNodeTable.id, edge.to_node_id)).get(),
                )
                if (!related) return null
                return { id: related.id, type: related.type, label: related.label, relation: edge.relation }
              })
              .filter(Boolean) as Array<{ id: string; type: string; label: string; relation: string }>

            return {
              node: { id: node.id, type: node.type, label: node.label, score: node.pagerank_score },
              relatedNodes,
            }
          })
        }),

      recomputePagerank: () =>
        Effect.sync(() => {
          const nodes = Database.use((db) => db.select().from(GraphNodeTable).all())
          const edges = Database.use((db) =>
            db
              .select()
              .from(GraphEdgeTable)
              .all()
              .map((e) => ({ from: e.from_node_id, to: e.to_node_id, weight: e.weight })),
          )
          const scores = computePagerank(
            nodes.map((n) => n.id),
            edges,
          )
          for (const [id, score] of scores) {
            Database.use((db) =>
              db.update(GraphNodeTable).set({ pagerank_score: score }).where(eq(GraphNodeTable.id, id)).run(),
            )
          }
        }),
    })
  }),
)

export const defaultLayer = layer

export * as GraphService from "./graph"
```

- [ ] **Step 7: Create `src/memory/graph/memory_graph.txt`**

```
Query the knowledge graph built from past session memory.

Use this when the user asks about files worked on, decisions made, people mentioned, or concepts discussed across sessions.

Examples:
- "what files have we changed related to auth?"
- "what decisions did we make about the database schema?"
- "what concepts have we discussed related to memory?"

Returns nodes from the graph with their related entities and PageRank importance scores.
```

- [ ] **Step 8: Create `src/memory/graph/graph-tool.ts`**

```typescript
import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { GraphService } from "./graph"
import DESCRIPTION from "./memory_graph.txt"

const Parameters = Schema.Struct({
  question: Schema.String.annotate({
    description: "Natural language question about past work, files, decisions, or concepts.",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of graph nodes to return. Default: 10.",
  }),
})

export const MemoryGraphTool = Tool.define(
  "memory_graph",
  Effect.gen(function* () {
    const run = Effect.fn("MemoryGraphTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      _ctx: Tool.Context,
    ) {
      const graph = yield* GraphService.Service
      const results = yield* graph.query({ question: params.question, limit: params.limit ?? 10 })
      return {
        title: "Memory graph query",
        metadata: { mode: "query" as const, count: results.length, question: params.question },
        output: JSON.stringify({ success: true, question: params.question, results }, null, 2),
      }
    })
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
```

- [ ] **Step 9: Run graph tests**

```
bun test packages/opencode/test/memory/graph.test.ts --timeout 15000
```

Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add packages/opencode/src/memory/graph/ packages/opencode/test/memory/graph.test.ts
git commit -m "feat: add GraphService with heuristic entity extraction and PageRank"
```

---

## Task 6: Wire Tools into ToolRegistry

**Files:**
- Modify: `packages/opencode/src/tool/registry.ts`

- [ ] **Step 1: Add imports**

At the top of `src/tool/registry.ts`, add:

```typescript
import { MemoryGraphTool } from "../memory/graph/graph-tool"
```

- [ ] **Step 2: Wire MemoryGraphTool into the registry**

Follow the exact same pattern as `SessionSearchTool`. In the `Effect.gen` block:

```typescript
const memoryGraph = yield* MemoryGraphTool
```

In `state.builtin`:
```typescript
memory_graph: Tool.init(memoryGraph),
```

In the `tools()` method, add `tool.memory_graph` to the returned array.

- [ ] **Step 3: Run registry tests (if any)**

```
bun test packages/opencode/test/tool/ --timeout 15000
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/tool/registry.ts
git commit -m "feat: register memory_graph tool in ToolRegistry"
```

---

## Task 7: Wire Vector + Graph into Curator Pipeline

**Files:**
- Modify: `packages/opencode/src/memory/curator/curator.ts`

- [ ] **Step 1: Import VectorService and GraphService in curator.ts**

```typescript
import { VectorService } from "@/memory/vector/vector"
import { GraphService } from "@/memory/graph/graph"
```

- [ ] **Step 2: After archiving important messages in run(), trigger indexing**

After the loop that archives important messages, add:

```typescript
// Index important messages in vector store and knowledge graph (best-effort)
yield* Effect.forkDaemon(
  Effect.gen(function* () {
    const vector = yield* VectorService.Service
    const graph = yield* GraphService.Service
    for (const item of archivedItems) {
      const archiveRows = Database.use((db) =>
        db
          .select()
          .from(MemoryArchiveTable)
          .where(eq(MemoryArchiveTable.message_id, item.id))
          .get(),
      )
      if (!archiveRows) continue
      yield* vector.index({ archiveID: archiveRows.id, sessionID, content: item.text })
      yield* graph.ingest({ archiveID: archiveRows.id, sessionID, content: item.text })
    }
    yield* graph.recomputePagerank()
  }).pipe(
    Effect.provide(Layer.merge(VectorService.defaultLayer, GraphService.defaultLayer)),
    Effect.orElse(() => Effect.void),
  ),
)
```

- [ ] **Step 3: Run all memory tests**

```
bun test packages/opencode/test/memory/ --timeout 30000
```

Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/memory/curator/curator.ts
git commit -m "feat: wire VectorService and GraphService into curator post-archival pipeline"
```

---

## Task 8: Create Memory Index and Export

**Files:**
- Create: `packages/opencode/src/memory/index.ts`

- [ ] **Step 1: Create `src/memory/index.ts`**

```typescript
import { Layer } from "effect"
import { CuratorService } from "./curator/curator"
import { VectorService } from "./vector/vector"
import { GraphService } from "./graph/graph"

export { CuratorService } from "./curator/curator"
export { VectorService } from "./vector/vector"
export { GraphService } from "./graph/graph"
export { MemoryGraphTool } from "./graph/graph-tool"

export const MemoryLayer = Layer.mergeAll(
  CuratorService.defaultLayer,
  VectorService.defaultLayer,
  GraphService.defaultLayer,
)
```

- [ ] **Step 2: Run full test suite for affected packages**

```
bun test packages/opencode/test/ --timeout 30000
```

Expected: All tests pass. If any session tests fail due to the curator hook, verify the `Effect.forkDaemon` + `Effect.orElse` wrapping isolates errors from the main session pipeline.

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/memory/index.ts
git commit -m "feat: export unified MemoryLayer from src/memory/index.ts"
```

---

## Task 9: Final Integration Verification

- [ ] **Step 1: Verify typecheck passes**

```
cd packages/opencode && bun run typecheck 2>&1 | head -40
```

Expected: 0 errors

- [ ] **Step 2: Run complete test suite**

```
bun test packages/opencode/test/ --timeout 30000
```

Expected: All tests pass

- [ ] **Step 3: Smoke test — create a session, add 20 messages, verify curator fires**

```
bun run dev
```

In the TUI: type 20+ messages, then run `memory_graph` tool with question "what files did we discuss". Verify it returns results.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete memory stack — curator, vector index, knowledge graph, memory_graph tool"
```
