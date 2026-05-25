import { Effect, Layer, Context } from "effect"
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
        const existing = dbUse((db) =>
          db.select().from(SonaReasoningBankTable).where(eq(SonaReasoningBankTable.pattern_hash, hash)).get(),
        )
        if (!existing) {
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
                avg_cost_usd: input.costUsd,
                task_type: input.taskType,
                time_created: Date.now(),
                time_updated: Date.now(),
              })
              .run(),
          )
        } else {
          const newCount = existing.success_count + 1
          const newAvgCost =
            input.costUsd != null && existing.avg_cost_usd != null
              ? (existing.avg_cost_usd * existing.success_count + input.costUsd) / newCount
              : existing.avg_cost_usd
          dbUse((db) =>
            db
              .update(SonaReasoningBankTable)
              .set({ success_count: newCount, avg_cost_usd: newAvgCost, time_updated: Date.now() })
              .where(eq(SonaReasoningBankTable.pattern_hash, hash))
              .run(),
          )
        }
      }
      log.info("trajectory recorded", { sessionID: input.sessionID, success: input.success })
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
