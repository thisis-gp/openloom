import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Provider } from "@/provider/provider"
import { VectorEmbeddingTable } from "./vector.sql"
import { MemoryArchiveTable } from "@/memory/curator/curator.sql"
import { SessionID } from "@/session/schema"
import { topK } from "./flat"
import { embedText } from "./embed"
import { HnswIndex } from "./hnsw"

let hnswCache: HnswIndex | null = null
const HNSW_THRESHOLD = 500

function getOrBuildHnsw(entries: Array<{ id: string; vector: number[] }>): HnswIndex {
  if (hnswCache && hnswCache.size === entries.length) return hnswCache
  const dim = entries[0]?.vector.length ?? 1536
  const idx = new HnswIndex(dim, Math.max(entries.length * 2, 1000))
  for (const e of entries) idx.add(e.id, e.vector)
  hnswCache = idx
  return idx
}

export type VectorDeps = Config.Service | Auth.Service | Provider.Service

export interface Interface {
  readonly index: (input: {
    archiveID: string
    sessionID: SessionID
    content: string
  }) => Effect.Effect<string | null, never, VectorDeps>

  readonly search: (input: {
    query: string
    limit: number
  }) => Effect.Effect<Array<{ archiveID: string; sessionID: SessionID; score: number }>, never, VectorDeps>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/VectorService") {}

export const layer: Layer.Layer<Service, never, Config.Service | Auth.Service | Provider.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      index: ({ archiveID, sessionID, content }) =>
        Effect.gen(function* () {
          const existing = Database.use((db) =>
            db.select().from(VectorEmbeddingTable).where(eq(VectorEmbeddingTable.archive_id, archiveID)).get(),
          )
          if (existing) return existing.id

          const embedded = yield* embedText(content)
          if (!embedded) return null

          const id = crypto.randomUUID()
          const now = Date.now()
          Database.use((db) =>
            db
              .insert(VectorEmbeddingTable)
              .values({
                id,
                archive_id: archiveID,
                session_id: sessionID,
                model: embedded.model,
                vector: embedded.vector,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          Database.use((db) =>
            db.update(MemoryArchiveTable).set({ embedding_id: id }).where(eq(MemoryArchiveTable.id, archiveID)).run(),
          )
          hnswCache = null // invalidate so next search rebuilds
          return id
        }),

      search: ({ query, limit }) =>
        Effect.gen(function* () {
          const embedded = yield* embedText(query)
          if (!embedded) return []

          const allEmbeddings = Database.use((db) => db.select().from(VectorEmbeddingTable).all())
          if (allEmbeddings.length === 0) return []

          const entries = allEmbeddings.map((e) => ({ id: e.id, vector: e.vector }))
          let results: Array<{ id: string; score: number }>
          if (allEmbeddings.length >= HNSW_THRESHOLD) {
            const hnsw = getOrBuildHnsw(entries)
            results = hnsw.search(embedded.vector, limit)
          } else {
            results = topK(embedded.vector, entries, limit)
          }

          return results.map((r) => {
            const row = allEmbeddings.find((e) => e.id === r.id)!
            return {
              archiveID: row.archive_id,
              sessionID: row.session_id as SessionID,
              score: r.score,
            }
          })
        }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Auth.defaultLayer),
)

export * as VectorService from "./vector"
