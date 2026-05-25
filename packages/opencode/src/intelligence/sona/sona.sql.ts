import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../../storage/schema.sql"

export const SonaTrajectoryTable = sqliteTable(
  "sona_trajectories",
  {
    id: text().notNull().primaryKey(),
    session_id: text().notNull(),
    tool_sequence: text().notNull(),
    model_id: text().notNull(),
    provider_id: text().notNull(),
    success: integer().notNull().default(0),
    cost_usd: real(),
    duration_ms: integer(),
    task_type: text(),
    ...Timestamps,
  },
  (table) => [
    index("sona_trajectories_session_idx").on(table.session_id),
    index("sona_trajectories_model_idx").on(table.model_id, table.provider_id),
  ],
)

export const SonaReasoningBankTable = sqliteTable(
  "sona_reasoning_bank",
  {
    id: text().notNull().primaryKey(),
    pattern_hash: text().notNull().unique(),
    tool_sequence: text().notNull(),
    best_model_id: text().notNull(),
    best_provider_id: text().notNull(),
    success_count: integer().notNull().default(1),
    avg_cost_usd: real(),
    task_type: text(),
    ...Timestamps,
  },
  (table) => [
    index("sona_bank_hash_idx").on(table.pattern_hash),
    index("sona_bank_task_idx").on(table.task_type),
  ],
)
