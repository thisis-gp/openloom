import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
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
     * asynchronously after archival.
     */
    embedding_id: text(),
    /** The curator_runs.id for the run that created this record */
    curator_run_id: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("memory_archive_session_idx").on(table.session_id),
    index("memory_archive_tier_idx").on(table.tier),
    uniqueIndex("memory_archive_message_id_idx").on(table.message_id),
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
