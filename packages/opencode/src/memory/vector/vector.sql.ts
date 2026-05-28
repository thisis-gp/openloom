import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { MemoryArchiveTable } from "../curator/curator.sql"
import { Timestamps } from "../../storage/schema.sql"
import type { SessionID } from "../../session/schema"

/**
 * Stores embedding vectors for archived messages.
 * Each row corresponds to one MemoryArchiveTable entry that has been embedded.
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
    /** JSON-serialised float array */
    vector: text({ mode: "json" }).notNull().$type<number[]>(),
    ...Timestamps,
  },
  (table) => [
    index("vector_embeddings_session_idx").on(table.session_id),
    uniqueIndex("vector_embeddings_archive_id_idx").on(table.archive_id),
  ],
)
