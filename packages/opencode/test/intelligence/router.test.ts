import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { testEffect } from "../lib/effect"
import { RouterService, defaultLayer as routerLayer } from "../../src/intelligence/router/router"

const it = testEffect(routerLayer)

describe("RouterService.select", () => {
  it.live(
    "returns userOverride immediately without DB access",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        const result = yield* router.select({
          taskType: "code",
          estimatedTokens: 1000,
          candidates: [
            { modelID: "claude-sonnet-4-6", providerID: "anthropic" },
            { modelID: "gpt-4o-mini", providerID: "openai" },
          ],
          userOverride: { modelID: "claude-opus-4-7", providerID: "anthropic" },
        })
        expect(result.modelID).toBe("claude-opus-4-7")
        expect(result.providerID).toBe("anthropic")
      }),
    10_000,
  )

  it.live(
    "selects from candidates when no override",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        const candidates = [
          { modelID: "claude-haiku-4-5-20251001", providerID: "anthropic" },
          { modelID: "claude-sonnet-4-6", providerID: "anthropic" },
          { modelID: "gpt-4o-mini", providerID: "openai" },
        ]
        const result = yield* router.select({
          taskType: "chat",
          estimatedTokens: 500,
          candidates,
        })
        const found = candidates.find(
          (c) => c.modelID === result.modelID && c.providerID === result.providerID,
        )
        expect(found).toBeDefined()
      }),
    10_000,
  )

  it.live(
    "fails when candidates array is empty",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        const exit = yield* router
          .select({ taskType: "code", estimatedTokens: 100, candidates: [] })
          .pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(String(Cause.squash(exit.cause))).toContain("candidates array is empty")
        }
      }),
    10_000,
  )
})

describe("RouterService.recordOutcome + priors", () => {
  it.live(
    "alpha increases after a successful call",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        yield* router.recordOutcome({
          modelID: "deepseek-chat",
          providerID: "deepseek",
          success: true,
          costUsd: 0.001,
        })
        const all = yield* router.priors()
        const row = all.find((r) => r.modelID === "deepseek-chat" && r.providerID === "deepseek")
        expect(row).toBeDefined()
        expect(row!.alpha).toBe(2)
        expect(row!.beta).toBe(1)
        expect(row!.totalCalls).toBe(1)
      }),
    10_000,
  )

  it.live(
    "beta increases after a failed call",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        yield* router.recordOutcome({
          modelID: "deepseek-reasoner",
          providerID: "deepseek",
          success: false,
          costUsd: 0.002,
        })
        const all = yield* router.priors()
        const row = all.find((r) => r.modelID === "deepseek-reasoner" && r.providerID === "deepseek")
        expect(row!.alpha).toBe(1)
        expect(row!.beta).toBe(2)
      }),
    10_000,
  )
})
