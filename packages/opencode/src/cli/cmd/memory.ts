import path from "path"
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { InstanceRef } from "@/effect/instance-ref"
import { Database } from "@/storage/db"
import { MemoryArchiveTable, CuratorRunTable } from "@/memory/curator/curator.sql"
import { VectorEmbeddingTable } from "@/memory/vector/vector.sql"
import { GraphNodeTable, GraphEdgeTable } from "@/memory/graph/graph.sql"
import { UI } from "../ui"

type MemoryBackup = {
  version: 1
  exported_at: number
  memory_archive: Array<typeof MemoryArchiveTable.$inferSelect>
  curator_run: Array<typeof CuratorRunTable.$inferSelect>
  vector_embedding: Array<typeof VectorEmbeddingTable.$inferSelect>
  graph_nodes: Array<typeof GraphNodeTable.$inferSelect>
  graph_edges: Array<typeof GraphEdgeTable.$inferSelect>
}

const runBackup = Effect.fn("Memory.backup")(function* (filePath: string) {
  const payload: MemoryBackup = {
    version: 1,
    exported_at: Date.now(),
    memory_archive: Database.use((db) => db.select().from(MemoryArchiveTable).all()),
    curator_run: Database.use((db) => db.select().from(CuratorRunTable).all()),
    vector_embedding: Database.use((db) => db.select().from(VectorEmbeddingTable).all()),
    graph_nodes: Database.use((db) => db.select().from(GraphNodeTable).all()),
    graph_edges: Database.use((db) => db.select().from(GraphEdgeTable).all()),
  }
  yield* Effect.tryPromise({
    try: () => Bun.write(filePath, JSON.stringify(payload, null, 2)),
    catch: (err) => err,
  }).pipe(
    Effect.catch((err) => fail(err instanceof Error ? err.message : String(err))),
  )
  UI.println(
    `Wrote memory backup (${payload.memory_archive.length} archives, ${payload.vector_embedding.length} embeddings, ${payload.graph_nodes.length} nodes) to ${filePath}`,
  )
})

const runRestore = Effect.fn("Memory.restore")(function* (filePath: string) {
  const raw = yield* Effect.tryPromise({
    try: () => Bun.file(filePath).text(),
    catch: (err) => err,
  }).pipe(
    Effect.catch((err) => fail(err instanceof Error ? err.message : String(err))),
  )
  const backup = JSON.parse(raw) as MemoryBackup
  Database.use((db) => {
    for (const row of backup.memory_archive) {
      db.insert(MemoryArchiveTable).values(row).onConflictDoNothing().run()
    }
    for (const row of backup.curator_run) {
      db.insert(CuratorRunTable).values(row).onConflictDoNothing().run()
    }
    for (const row of backup.vector_embedding) {
      db.insert(VectorEmbeddingTable).values(row).onConflictDoNothing().run()
    }
    for (const row of backup.graph_nodes) {
      db.insert(GraphNodeTable).values(row).onConflictDoNothing().run()
    }
    for (const row of backup.graph_edges) {
      db.insert(GraphEdgeTable).values(row).onConflictDoNothing().run()
    }
  })
  UI.println(`Restored memory backup from ${filePath}`)
})

export const MemoryCommand = effectCmd({
  command: "memory <action>",
  describe: "export or import long-term memory tables (archives, vectors, graph)",
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "backup or restore",
        type: "string",
        choices: ["backup", "restore"] as const,
        demandOption: true,
      })
      .option("file", {
        describe: "JSON file path (default: ./memory-backup.json)",
        type: "string",
      }),
  handler: Effect.fn("Cli.memory")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return yield* Effect.die("InstanceRef not provided")
    const file = path.resolve(args.file ?? "memory-backup.json")
    if (args.action === "backup") return yield* runBackup(file)
    return yield* runRestore(file)
  }),
})
