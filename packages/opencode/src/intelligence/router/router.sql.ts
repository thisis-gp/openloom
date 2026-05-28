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
