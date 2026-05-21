import { Effect, Layer, Context } from "effect"
import * as Option from "effect/Option"
import { isNull, eq, and, desc, inArray } from "drizzle-orm"
import { Database } from "@/storage/db"
import { MessageTable, PartTable } from "@/session/session.sql"
import { MemoryArchiveTable, CuratorRunTable } from "./curator.sql"
import { SessionID, MessageID } from "@/session/schema"
import { VectorService } from "@/memory/vector/vector"
import { GraphService } from "@/memory/graph/graph"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Provider } from "@/provider/provider"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "memory.curator" })

const THRESHOLD = 20
const RECENT_KEEP = 50

function getMessageText(parts: Array<{ type: string; data: { text?: string } }>): string {
  return parts
    .filter((p) => p.type === "text" || p.type === "reasoning")
    .map((p) => p.data.text ?? "")
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

export const layer: Layer.Layer<Service, never, VectorService.Service | GraphService.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const vectorOpt = yield* Effect.serviceOption(VectorService.Service)
    const graphOpt = yield* Effect.serviceOption(GraphService.Service)
    const config = yield* Effect.serviceOption(Config.Service)
    const auth = yield* Effect.serviceOption(Auth.Service)
    const provider = yield* Effect.serviceOption(Provider.Service)

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
        const now = Date.now()

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

        const msgIDs = unprocessed.map((m) => m.id)
        const allParts = Database.use((db) =>
          db.select().from(PartTable).where(inArray(PartTable.message_id, msgIDs)).all(),
        )
        const partsByMsg = new Map(
          msgIDs.map((msgID) => [
            msgID,
            allParts
              .filter((part) => part.message_id === msgID)
              .map((part) => {
                const data = part.data as { type?: string; text?: string }
                return { type: data.type ?? "text", data }
              }),
          ]),
        )

        const importantSignals =
          /decid|implement|fix|error|bug|creat|add|remov|updat|schema|migrat|deploy|configur/i
        const classified: Array<{ id: string; importance: "important" | "routine"; text: string }> = []

        for (const msg of unprocessed) {
          const parts = partsByMsg.get(msg.id) ?? []
          const text = getMessageText(parts)
          const importance: "important" | "routine" = importantSignals.test(text) ? "important" : "routine"
          classified.push({ id: msg.id, importance, text })
        }

        const importantIDs = classified.filter((c) => c.importance === "important").map((c) => c.id)

        for (const item of classified.filter((c) => c.importance === "important")) {
          Database.use((db) =>
            db
              .insert(MemoryArchiveTable)
              .values({
                id: crypto.randomUUID(),
                session_id: sessionID,
                message_id: item.id as MessageID,
                tier: "archive",
                importance: "important",
                content: item.text,
                curator_run_id: runID,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          Database.use((db) =>
            db
              .update(MessageTable)
              .set({ memory_tier: "archive", curator_run_id: runID, time_updated: now })
              .where(eq(MessageTable.id, item.id as MessageID))
              .run(),
          )
        }

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
          if (recentSet.has(item.id as MessageID)) {
            Database.use((db) =>
              db
                .update(MessageTable)
                .set({ memory_tier: "recent", curator_run_id: runID, time_updated: now })
                .where(eq(MessageTable.id, item.id as MessageID))
                .run(),
            )
            continue
          }
          Database.use((db) =>
            db
              .insert(MemoryArchiveTable)
              .values({
                id: crypto.randomUUID(),
                session_id: sessionID,
                message_id: item.id as MessageID,
                tier: "pruned",
                importance: "routine",
                content: item.text.slice(0, 200),
                curator_run_id: runID,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          Database.use((db) =>
            db
              .update(MessageTable)
              .set({ memory_tier: "pruned", curator_run_id: runID, time_updated: now })
              .where(eq(MessageTable.id, item.id as MessageID))
              .run(),
          )
          pruned++
        }

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
              time_created: now,
              time_updated: now,
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

          if (archivedItems.length > 0) {
            yield* Effect.gen(function* () {
              for (const item of archivedItems) {
                const archiveRow = Database.use((db) =>
                  db
                    .select()
                    .from(MemoryArchiveTable)
                    .where(eq(MemoryArchiveTable.message_id, item.id as MessageID))
                    .get(),
                )
                if (!archiveRow) continue
                if (Option.isSome(vectorOpt)) {
                  const indexEffect = vectorOpt.value.index({
                    archiveID: archiveRow.id,
                    sessionID,
                    content: item.text,
                  })
                  const withDeps = Option.isSome(config) && Option.isSome(auth) && Option.isSome(provider)
                    ? indexEffect.pipe(
                        Effect.provideService(Config.Service, config.value),
                        Effect.provideService(Auth.Service, auth.value),
                        Effect.provideService(Provider.Service, provider.value),
                      )
                    : Effect.void
                  yield* withDeps.pipe(Effect.ignore)
                }
                if (Option.isSome(graphOpt)) {
                  yield* graphOpt.value.ingest({
                    archiveID: archiveRow.id,
                    sessionID,
                    content: item.text,
                  })
                }
              }
              if (Option.isSome(graphOpt)) yield* graphOpt.value.recomputePagerank()
            }).pipe(Effect.orElseSucceed(() => undefined))
          }

          return { classified: unprocessed.length, archived: importantIDs.length, pruned, nudgeText }
        }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provideMerge(Layer.mergeAll(GraphService.defaultLayer, VectorService.defaultLayer)),
)

export * as CuratorService from "./curator"
