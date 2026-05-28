import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "../project/schema"
import type { SessionID } from "../session/schema"

/**
 * Defines a scheduled agentic task.
 */
export const CronJobTable = sqliteTable(
  "cron_jobs",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    /** Human-readable name for display in the UI */
    name: text().notNull(),
    /** Standard cron expression, e.g. "0 9 * * 1-5" (weekdays at 09:00) */
    schedule: text().notNull(),
    /** Natural-language goal passed as the initial prompt to the spawned session */
    goal: text().notNull(),
    /** Agent preset to use for the spawned session, defaults to 'build' */
    agent: text().notNull().default("build"),
    /** JSON array of tool IDs to block */
    toolset_blocklist: text({ mode: "json" }).$type<string[]>(),
    /** If 1, the spawned session runs without user approval gates */
    auto_approve: integer().notNull().default(0),
    /** If 0, this job is paused and will not be dispatched */
    enabled: integer().notNull().default(1),
    /** Unix timestamp (ms) of the most recent run, null if never run */
    last_run: integer(),
    /** Unix timestamp (ms) of the next scheduled run */
    next_run: integer(),
    /** SessionID of the most recently spawned session */
    last_session_id: text().$type<SessionID>(),
    /** SessionID currently running for this job, null when idle */
    running_session_id: text().$type<SessionID>(),
    /** Most recent scheduler or child-session error */
    last_error: text(),
    /** Number of times the scheduler has attempted to run this job */
    run_count: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [
    index("cron_jobs_project_idx").on(table.project_id),
    index("cron_jobs_next_run_idx").on(table.next_run),
    index("cron_jobs_enabled_next_run_idx").on(table.enabled, table.next_run),
  ],
)
