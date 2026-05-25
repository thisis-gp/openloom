import { Effect, Layer, Context } from "effect"
import { sql } from "drizzle-orm"
import { createHash } from "crypto"
import { use as dbUse, eq } from "@/storage/db"
import { SonaTrajectoryTable, SonaReasoningBankTable } from "./sona.sql"
import { create as createID } from "@/id/id"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "intelligence.sona" })

export function hashToolSequence(tools: string[]): string {
  return createHash("sha256").update(tools.join(",")).digest("hex").slice(0, 16)
}

export function extractPattern(tools: string[]): string[] {
  return tools.slice(-5)
}

export interface SonaInterface {
  readonly recordTrajectory: (input: {
    sessionID: string
    toolSequence: string[]
    modelID: string
    providerID: string
    success: boolean
    costUsd?: number
    durationMs?: number
    taskType?: string
  }) => Effect.Effect<void>

  readonly queryBank: (input: {
    recentTools: string[]
    taskType?: string
  }) => Effect.Effect<{ modelID: string; providerID: string } | undefined>

  readonly distill: () => Effect.Effect<void>
}

export class SonaService extends Context.Service<SonaService, SonaInterface>()("@openloom/SonaService") {}

export const layer: Layer.Layer<SonaService> = Layer.succeed(SonaService, {
  recordTrajectory(input) {
    return Effect.sync(() => {
      try {
        const id = createID("sona", "ascending")
        dbUse((db) =>
          db
            .insert(SonaTrajectoryTable)
            .values({
              id,
              session_id: input.sessionID,
              tool_sequence: JSON.stringify(input.toolSequence),
              model_id: input.modelID,
              provider_id: input.providerID,
              success: input.success ? 1 : 0,
              cost_usd: input.costUsd,
              duration_ms: input.durationMs,
              task_type: input.taskType,
              time_created: Date.now(),
              time_updated: Date.now(),
            })
            .run(),
        )

        if (input.success) {
          const pattern = extractPattern(input.toolSequence)
          const hash = hashToolSequence(pattern)
          dbUse((db) =>
            db
              .insert(SonaReasoningBankTable)
              .values({
                id: createID("sona", "ascending"),
                pattern_hash: hash,
                tool_sequence: JSON.stringify(pattern),
                best_model_id: input.modelID,
                best_provider_id: input.providerID,
                success_count: 1,
                avg_cost_usd: input.costUsd ?? null,
                task_type: input.taskType ?? null,
                time_created: Date.now(),
                time_updated: Date.now(),
              })
              .onConflictDoUpdate({
                target: SonaReasoningBankTable.pattern_hash,
                set: {
                  success_count: sql`${SonaReasoningBankTable.success_count} + 1`,
                  time_updated: Date.now(),
                },
              })
              .run(),
          )
        }
        log.info("trajectory recorded", { sessionID: input.sessionID, success: input.success })
      } catch (err) {
        log.warn("SONA trajectory record failed", { err: String(err), sessionID: input.sessionID })
      }
    })
  },

  queryBank(input) {
    return Effect.sync(() => {
      const pattern = extractPattern(input.recentTools)
      const hash = hashToolSequence(pattern)
      const row = dbUse((db) =>
        db.select().from(SonaReasoningBankTable).where(eq(SonaReasoningBankTable.pattern_hash, hash)).get(),
      )
      if (!row) return undefined
      return { modelID: row.best_model_id, providerID: row.best_provider_id }
    })
  },

  distill() {
    return Effect.void
  },
})
