import { Effect, Layer, Context } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { Database, eq, and } from "@/storage/db"
import { RouterOutcomeTable } from "./router.sql"
import { RouterPolicy } from "./router.config"
import { Provider } from "@/provider/provider"
import type { ProviderID, ModelID } from "@/provider/schema"
import { SonaService, layer as sonaLayer } from "../sona/sona"

function gammaSample(shape: number): number {
  if (shape < 1) {
    return gammaSample(1 + shape) * Math.pow(Math.random(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  while (true) {
    let x: number
    let v: number
    do {
      x = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = gammaSample(alpha)
  const y = gammaSample(beta)
  return x / (x + y)
}

export interface RouterInterface {
  readonly select: (input: {
    taskType: "code" | "research" | "chat" | "reasoning"
    estimatedTokens: number
    candidates: Array<{ modelID: string; providerID: string }>
    userOverride?: { modelID: string; providerID: string }
  }) => Effect.Effect<{ modelID: string; providerID: string }>

  readonly recordOutcome: (input: {
    modelID: string
    providerID: string
    success: boolean
    costUsd: number
  }) => Effect.Effect<void>

  readonly priors: () => Effect.Effect<
    Array<{
      modelID: string
      providerID: string
      alpha: number
      beta: number
      totalCalls: number
    }>
  >
}

export class RouterService extends Context.Service<RouterService, RouterInterface>()("@openloom/RouterService") {}

export const layer: Layer.Layer<RouterService, never, Provider.Service | SonaService> = Layer.effect(
  RouterService,
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const sona = yield* SonaService

    function loadPrior(modelID: string, providerID: string) {
      const row = Database.use((db) =>
        db
          .select()
          .from(RouterOutcomeTable)
          .where(and(eq(RouterOutcomeTable.model_id, modelID), eq(RouterOutcomeTable.provider_id, providerID)))
          .get(),
      )
      if (!row) return { alpha: 1, beta: 1, totalCalls: 0 }
      return { alpha: row.alpha, beta: row.beta, totalCalls: row.total_calls }
    }

    function upsertPrior(
      modelID: string,
      providerID: string,
      newAlpha: number,
      newBeta: number,
      totalCalls: number,
      costUsd: number,
    ) {
      const now = Date.now()
      Database.use((db) =>
        db
          .insert(RouterOutcomeTable)
          .values({
            model_id: modelID,
            provider_id: providerID,
            alpha: newAlpha,
            beta: newBeta,
            total_calls: totalCalls,
            last_cost_usd: costUsd,
            time_created: now,
            time_updated: now,
          })
          .onConflictDoUpdate({
            target: [RouterOutcomeTable.model_id, RouterOutcomeTable.provider_id],
            set: {
              alpha: newAlpha,
              beta: newBeta,
              total_calls: totalCalls,
              last_cost_usd: costUsd,
              time_updated: now,
            },
          })
          .run(),
      )
    }

    const select: RouterInterface["select"] = (input) =>
      Effect.gen(function* () {
      if (input.userOverride) return input.userOverride

      if (input.candidates.length === 0) {
        return yield* Effect.die(new Error("RouterService.select: candidates array is empty"))
      }

      const bankHit = yield* sona.queryBank({ recentTools: input.candidates.map((c) => c.modelID) })
      if (bankHit) {
        const match = input.candidates.find(
          (c) => c.modelID === bankHit.modelID && c.providerID === bankHit.providerID,
        )
        if (match) return match
      }

      const cheapBoost = input.taskType === "chat" || input.taskType === "research"
      let best: { modelID: string; providerID: string } | undefined
      let bestScore = -Infinity

      for (const candidate of input.candidates) {
        const { alpha, beta } = loadPrior(candidate.modelID, candidate.providerID)
        const sample = sampleBeta(alpha, beta)

        let costPerToken = 0.000001
        const ctx = yield* InstanceRef
        if (ctx) {
          const meta = yield* provider
            .getModel(candidate.providerID as ProviderID, candidate.modelID as ModelID)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (meta?.cost.input) costPerToken = meta.cost.input
        }
        const estimatedCost = costPerToken * input.estimatedTokens
        let score = sample * (1 / (estimatedCost + 0.001))

        if (cheapBoost && costPerToken < 0.000002) {
          score *= RouterPolicy.maxCostBoost
        }

        if (score > bestScore) {
          bestScore = score
          best = candidate
        }
      }

      return best!
      })

    const recordOutcome: RouterInterface["recordOutcome"] = Effect.fn("RouterService.recordOutcome")(function* (
      input,
    ) {
      const { alpha, beta, totalCalls } = loadPrior(input.modelID, input.providerID)
      const newAlpha = alpha + (input.success ? 1 : 0)
      const newBeta = beta + (input.success ? 0 : 1)
      upsertPrior(input.modelID, input.providerID, newAlpha, newBeta, totalCalls + 1, input.costUsd)
      yield* sona.recordTrajectory({
        sessionID: "global",
        toolSequence: [input.modelID],
        modelID: input.modelID,
        providerID: input.providerID,
        success: input.success,
        costUsd: input.costUsd,
      })
    })

    const priors: RouterInterface["priors"] = Effect.fn("RouterService.priors")(function* () {
      const rows = Database.use((db) => db.select().from(RouterOutcomeTable).all())
      return rows.map((r) => ({
        modelID: r.model_id,
        providerID: r.provider_id,
        alpha: r.alpha,
        beta: r.beta,
        totalCalls: r.total_calls,
      }))
    })

    return RouterService.of({ select, recordOutcome, priors })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Provider.defaultLayer), Layer.provide(sonaLayer))

export * as IntelligenceRouter from "./router"
