# Intelligence Layer: Router + Context Compression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-provider Thompson sampling model routing and strengthen the existing context compaction path to reduce costs and extend session length.

**Architecture:** Router reads/writes `RouterOutcomeTable` (created in Plan 1) and uses OpenLoom's existing provider catalog as the source of model metadata. Compression extends the existing `SessionCompaction` service in `packages/opencode/src/session/compaction.ts`; do not create a parallel `CompressionService`.

**Tech Stack:** Effect, Drizzle ORM, SQLite, TypeScript, Bun

**Depends on:** Plan 1 (Foundation) must be applied first — requires `RouterOutcomeTable` and message metadata columns.

---

## Overview

## Implementation Corrections

These corrections supersede the stale snippets below:

- Do not create `router.config.ts` with hardcoded model IDs or prices. Use the current `Provider` catalog for model cost, context, capability, and availability metadata. Router-specific config should only contain policy knobs such as exploration rate, quality floor, cost ceiling, disabled providers, and circuit-breaker thresholds.
- Do not create a new `CompressionService`. OpenLoom already has `SessionCompaction`; extend that service and its tests.
- Do not assume `message.compressed = 1` excludes a message from context. That only becomes true after `MessageV2` model-message assembly is explicitly changed and tested.
- Do not insert synthetic system-role rows into `MessageTable` for summaries. Use the existing compaction part/message path so summaries remain distinguishable from active user/developer instructions.
- All type checks in this repo should be `cd packages/opencode && bun typecheck`.
- Router selection must bypass itself when the user explicitly chose a model.
- Copy Ruflo's useful routing ideas: lexical/semantic complexity scoring, uncertainty escalation, bounded learning history, circuit breakers, and outcome recording from actual provider finish/error/cost data.
- Copy Hermes' useful compaction ideas: reference-only summary prefix, token-budgeted protected tail, JSON-aware tool argument/result shrinking, image stripping, secret redaction, manual focus-topic compression, and failure cooldown.

```
packages/opencode/src/intelligence/
├── index.ts                        # Re-exports both layers
├── router/
│   ├── router.config.ts            # Router policy only; no static model catalog
│   └── router.ts                   # RouterService — Thompson sampling select + recordOutcome
└── compression/
    └── README.md                   # Optional notes for SessionCompaction extensions

packages/opencode/test/intelligence/
├── router.test.ts                  # Unit tests for RouterService
└── compaction.test.ts              # Focused tests for SessionCompaction enhancements
```

Integration points:
- `src/provider/provider.ts` and the model selection call site — route only when model selection is automatic
- `src/session/prompt.ts` / `src/session/compaction.ts` — use the existing overflow/compaction pipeline
- `src/intelligence/index.ts` — barrel export so consumers import from one place

---

## Task 1 — Create router policy config, not a static model catalog

No test needed for this task. Pure policy module.

### Step 1.1 — Write the file

Create `packages/opencode/src/intelligence/router/router.config.ts`:

```typescript
// packages/opencode/src/intelligence/router/router.config.ts

export const RouterPolicy = {
  explorationRate: 0.08,
  minimumSamplesBeforeExploit: 20,
  maxCostBoost: 2.5,
  circuitBreakerFailureWindow: 20,
  circuitBreakerFailureRate: 0.5,
  outcomeHistoryLimit: 500,
} as const
```

### Verification

- [ ] File exists at `packages/opencode/src/intelligence/router/router.config.ts`
- [ ] It contains router policy only, with no hardcoded model catalog
- [ ] TypeScript compiles: `cd packages/opencode && bun typecheck`

---

## Task 2 — Create `router.ts` (RouterService with Thompson sampling)

### Step 2.1 — Understand the DB table from Plan 1

Plan 1 creates `RouterOutcomeTable` in `src/intelligence/router/router.sql.ts`:

```typescript
// RouterOutcomeTable columns (reference only — do NOT recreate):
//   model_id    text  primary key (composite)
//   provider_id text  primary key (composite)
//   alpha       real  NOT NULL  DEFAULT 1
//   beta        real  NOT NULL  DEFAULT 1
//   total_calls integer NOT NULL DEFAULT 0
//   last_cost_usd real NOT NULL DEFAULT 0
//   time_created integer NOT NULL
//   time_updated integer NOT NULL
```

### Step 2.2 — Write the file

Create `packages/opencode/src/intelligence/router/router.ts`:

```typescript
// packages/opencode/src/intelligence/router/router.ts

import { Effect, Layer, Context } from "effect"
import { Database, eq, and } from "@/storage/db"
import { RouterOutcomeTable } from "./router.sql"
import { getModelMeta } from "./router.config"

// ---------------------------------------------------------------------------
// Beta distribution sampling (pure math — no deps)
// ---------------------------------------------------------------------------

/**
 * Marsaglia-Tsang method for sampling from Gamma(shape, 1).
 * Used internally by sampleBeta.
 */
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
      // Box-Muller standard normal
      x = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/**
 * Draw one sample from Beta(alpha, beta) using the Gamma ratio method.
 * Result is in [0, 1].
 */
function sampleBeta(alpha: number, beta: number): number {
  const x = gammaSample(alpha)
  const y = gammaSample(beta)
  return x / (x + y)
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface RouterInterface {
  /**
   * Select the best candidate model for a task using Thompson sampling.
   * If `userOverride` is provided it is returned directly without DB access.
   */
  readonly select: (input: {
    taskType: "code" | "research" | "chat" | "reasoning"
    estimatedTokens: number
    candidates: Array<{ modelID: string; providerID: string }>
    userOverride?: { modelID: string; providerID: string }
  }) => Effect.Effect<{ modelID: string; providerID: string }>

  /**
   * Record the outcome of a completed model call.
   * Updates Beta distribution priors in the DB.
   * alpha += success ? 1 : 0  (reward)
   * beta  += success ? 0 : 1  (penalty)
   */
  readonly recordOutcome: (input: {
    modelID: string
    providerID: string
    success: boolean
    costUsd: number
  }) => Effect.Effect<void>

  /**
   * Return current Beta priors for all rows stored in RouterOutcomeTable.
   */
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

export class RouterService extends Context.Service<RouterService, RouterInterface>()(
  "@openloom/RouterService",
) {}

// ---------------------------------------------------------------------------
// Layer implementation
// ---------------------------------------------------------------------------

export const layer: Layer.Layer<RouterService, never, never> = Layer.effect(
  RouterService,
  Effect.gen(function* () {
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function loadPrior(modelID: string, providerID: string): { alpha: number; beta: number; totalCalls: number } {
      const row = Database.use((db) =>
        db
          .select()
          .from(RouterOutcomeTable)
          .where(
            and(eq(RouterOutcomeTable.model_id, modelID), eq(RouterOutcomeTable.provider_id, providerID)),
          )
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
    ): void {
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

    // -----------------------------------------------------------------------
    // select()
    // -----------------------------------------------------------------------
    const select: RouterInterface["select"] = Effect.fn("RouterService.select")(function* (input) {
      // Honour explicit user override — no DB access needed.
      if (input.userOverride) {
        return input.userOverride
      }

      if (input.candidates.length === 0) {
        return yield* Effect.fail(new Error("RouterService.select: candidates array is empty"))
      }

      const cheapBoost = input.taskType === "chat" || input.taskType === "research"

      let best: { modelID: string; providerID: string } | undefined
      let bestScore = -Infinity

      for (const candidate of input.candidates) {
        const { alpha, beta } = loadPrior(candidate.modelID, candidate.providerID)
        const sample = sampleBeta(alpha, beta)

        // Fetch cost from static metadata (fallback to 0.000001 if unknown).
        const meta = getModelMeta(candidate.modelID, candidate.providerID)
        const costPerToken = meta?.costPerInputToken ?? 0.000001
        const estimatedCost = costPerToken * input.estimatedTokens

        // Score: Thompson sample weighted by inverse expected cost.
        // Small constant (0.001) prevents division by zero for zero-cost models.
        let score = sample * (1 / (estimatedCost + 0.001))

        // Give a 2x boost to cheaper models for non-critical task types.
        if (cheapBoost && (meta?.tier === "fast" || costPerToken < 0.000001)) {
          score *= 2
        }

        if (score > bestScore) {
          bestScore = score
          best = candidate
        }
      }

      // best is always defined here because candidates.length > 0.
      return best!
    })

    // -----------------------------------------------------------------------
    // recordOutcome()
    // -----------------------------------------------------------------------
    const recordOutcome: RouterInterface["recordOutcome"] = Effect.fn("RouterService.recordOutcome")(
      function* (input) {
        const { alpha, beta, totalCalls } = loadPrior(input.modelID, input.providerID)
        const newAlpha = alpha + (input.success ? 1 : 0)
        const newBeta = beta + (input.success ? 0 : 1)
        upsertPrior(input.modelID, input.providerID, newAlpha, newBeta, totalCalls + 1, input.costUsd)
      },
    )

    // -----------------------------------------------------------------------
    // priors()
    // -----------------------------------------------------------------------
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

export const defaultLayer = layer
```

### Verification checklist

- [ ] File exists at `packages/opencode/src/intelligence/router/router.ts`
- [ ] `gammaSample` and `sampleBeta` are pure functions with no imports
- [ ] `select()` returns `userOverride` immediately when provided
- [ ] `recordOutcome()` uses `onConflictDoUpdate` to upsert
- [ ] TypeScript compiles: `cd packages/opencode && bun typecheck`

---

## Task 3 — Write `test/intelligence/router.test.ts`

### Step 3.1 — Write the test file

Create `packages/opencode/test/intelligence/router.test.ts`:

```typescript
// packages/opencode/test/intelligence/router.test.ts

import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"
import { RouterService, layer as routerLayer } from "../../src/intelligence/router/router"

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
    "selects from candidates when no override — returns a valid candidate",
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
    "statistically prefers cheaper models for chat tasks over many trials",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        const candidates = [
          { modelID: "gpt-4o-mini", providerID: "openai" },   // very cheap: 0.00000015
          { modelID: "claude-opus-4-7", providerID: "anthropic" }, // expensive: 0.000015
        ]
        const counts: Record<string, number> = { "gpt-4o-mini": 0, "claude-opus-4-7": 0 }
        for (let i = 0; i < 100; i++) {
          const result = yield* router.select({
            taskType: "chat",
            estimatedTokens: 2000,
            candidates,
          })
          counts[result.modelID] = (counts[result.modelID] ?? 0) + 1
        }
        // Cheaper model should win the majority of trials for chat tasks.
        expect(counts["gpt-4o-mini"]!).toBeGreaterThan(counts["claude-opus-4-7"]!)
      }),
    30_000,
  )

  it.live(
    "fails with error when candidates array is empty",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        const result = yield* router
          .select({ taskType: "code", estimatedTokens: 100, candidates: [] })
          .pipe(Effect.flip)
        expect((result as Error).message).toContain("candidates array is empty")
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

        // Record a successful outcome.
        yield* router.recordOutcome({
          modelID: "deepseek-chat",
          providerID: "deepseek",
          success: true,
          costUsd: 0.001,
        })

        const all = yield* router.priors()
        const row = all.find((r) => r.modelID === "deepseek-chat" && r.providerID === "deepseek")
        expect(row).toBeDefined()
        // Default alpha = 1, after one success alpha = 2.
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
        expect(row).toBeDefined()
        // Default beta = 1, after one failure beta = 2.
        expect(row!.alpha).toBe(1)
        expect(row!.beta).toBe(2)
        expect(row!.totalCalls).toBe(1)
      }),
    10_000,
  )

  it.live(
    "accumulated successes raise alpha cumulatively",
    () =>
      Effect.gen(function* () {
        const router = yield* RouterService
        for (let i = 0; i < 5; i++) {
          yield* router.recordOutcome({
            modelID: "gemini-2.0-flash",
            providerID: "google",
            success: true,
            costUsd: 0.0001,
          })
        }
        const all = yield* router.priors()
        const row = all.find((r) => r.modelID === "gemini-2.0-flash" && r.providerID === "google")
        expect(row!.alpha).toBe(6)   // 1 (default) + 5 successes
        expect(row!.beta).toBe(1)
        expect(row!.totalCalls).toBe(5)
      }),
    15_000,
  )
})
```

### Step 3.2 — Run the tests

```bash
bun test packages/opencode/test/intelligence/router.test.ts --timeout 15000
```

Expected output (all tests passing):

```
bun test v1.x.x
packages/opencode/test/intelligence/router.test.ts:
  RouterService.select
    ✓ returns userOverride immediately without DB access (Xms)
    ✓ selects from candidates when no override — returns a valid candidate (Xms)
    ✓ statistically prefers cheaper models for chat tasks over many trials (Xms)
    ✓ fails with error when candidates array is empty (Xms)
  RouterService.recordOutcome + priors
    ✓ alpha increases after a successful call (Xms)
    ✓ beta increases after a failed call (Xms)
    ✓ accumulated successes raise alpha cumulatively (Xms)
7 pass, 0 fail
```

### Verification checklist

- [ ] All 7 tests pass
- [ ] No TypeScript errors in the test file

---

## Task 4 — Extend `SessionCompaction` (do not create `CompressionService`)

The older implementation sketch below is retained only as background. Do not implement it literally. The actual work is:

- Update `packages/opencode/src/session/compaction.ts`.
- Preserve the existing `isOverflow`, prune, summary, tail-selection, and `compaction` part behavior.
- Add reference-only summary wording so compressed summaries cannot become active instructions.
- Add JSON-aware shrinking for old tool arguments/results, with secret redaction before any summary prompt is sent to a model.
- Protect the recent tail by both turn count and token budget.
- Add a failure cooldown so a failed compaction attempt does not retry on every prompt.
- Add focused tests in the existing session/compaction test area.

### Step 4.1 — Understand the MessageTable schema

Plan 1 adds a `compressed` column to `MessageTable`:

```typescript
// Added in Plan 1 — do NOT recreate:
// MessageTable.compressed: integer (boolean — 0 or 1, default 0, not null)
```

`compressed = 1` is metadata only until `MessageV2` model-message assembly explicitly honors it. Do not rely on it for context exclusion in this plan.

### Step 4.2 — Write the file

Do not create `packages/opencode/src/intelligence/compression/compression.ts` unless it contains small pure helpers used by `SessionCompaction`. The following older sketch is not implementation-ready because it duplicates the existing compaction service:

```typescript
// packages/opencode/src/intelligence/compression/compression.ts

import { Effect, Layer, Context } from "effect"
import { Database, eq, and, lt, asc, desc } from "@/storage/db"
import { MessageTable, PartTable } from "@/session/session.sql"
import { SessionID } from "@/session/schema"
import type { MessageV2 } from "@/session/message-v2"

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Compress when token count exceeds this fraction of the context limit. */
const COMPRESSION_THRESHOLD = 0.75

/** Number of most-recent messages that are never compressed ("focus window"). */
const DEFAULT_FOCUS = 10

/** Batch size for summary strategy. */
const SUMMARY_BATCH = 20

/** Name of the fast model used for abstract/summary LLM calls. */
const COMPRESSION_MODEL = "claude-haiku-4-5-20251001"
const COMPRESSION_PROVIDER = "anthropic"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type MessageRow = typeof MessageTable.$inferSelect
type PartRow = typeof PartTable.$inferSelect

function getMessages(sessionID: string): MessageRow[] {
  return Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID as any))
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all(),
  )
}

function getParts(messageID: string): PartRow[] {
  return Database.use((db) =>
    db
      .select()
      .from(PartTable)
      .where(eq(PartTable.message_id, messageID as any))
      .all(),
  )
}

function markCompressed(messageID: string): void {
  Database.use((db) =>
    db
      .update(MessageTable)
      .set({ compressed: 1, time_updated: Date.now() } as any)
      .where(eq(MessageTable.id, messageID as any))
      .run(),
  )
}

function isToolResult(row: MessageRow): boolean {
  const data = row.data as any
  return data?.role === "tool" || data?.type === "tool_result"
}

/**
 * Extract plain text from a message row by reading its parts.
 * Falls back to JSON-stringifying the data field for non-part messages.
 */
function extractText(row: MessageRow): string {
  const parts = getParts(row.id)
  if (parts.length === 0) {
    const data = row.data as any
    if (typeof data?.text === "string") return data.text
    return JSON.stringify(data)
  }
  return parts
    .map((p) => {
      const d = p.data as any
      if (d?.type === "text" && typeof d.text === "string") return d.text
      if (d?.type === "reasoning" && typeof d.text === "string") return d.text
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}

/**
 * Update the text content of an assistant message in-place.
 * Replaces the first text-type part's text (or the data.text field if no parts).
 */
function overwriteText(row: MessageRow, newText: string): void {
  const parts = getParts(row.id)
  const textPart = parts.find((p) => (p.data as any)?.type === "text")
  if (textPart) {
    const updated = { ...(textPart.data as any), text: newText }
    Database.use((db) =>
      db
        .update(PartTable)
        .set({ data: updated, time_updated: Date.now() } as any)
        .where(eq(PartTable.id, textPart.id as any))
        .run(),
    )
  } else {
    const updated = { ...(row.data as any), text: newText }
    Database.use((db) =>
      db
        .update(MessageTable)
        .set({ data: updated, time_updated: Date.now() } as any)
        .where(eq(MessageTable.id, row.id as any))
        .run(),
    )
  }
}

// ---------------------------------------------------------------------------
// LLM call helper
// ---------------------------------------------------------------------------

/**
 * Call the compression model (Haiku) with a single prompt.
 * Returns the model's text response.
 *
 * NOTE: This uses the Provider layer implicitly via the AI SDK. The actual
 * import path for your AI SDK wrapper should match the one used in
 * `src/agent/agent.ts`. Adjust if your project uses a different call site.
 */
async function callCompressionModel(prompt: string): Promise<string> {
  // Dynamic import to avoid circular deps — Provider is heavy.
  // Replace this with your project's actual LLM call helper if different.
  const { generateText } = await import("ai")
  const { createAnthropic } = await import("@ai-sdk/anthropic")
  const anthropic = createAnthropic()
  const { text } = await generateText({
    model: anthropic(COMPRESSION_MODEL),
    prompt,
    maxTokens: 512,
  })
  return text.trim()
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface CompressionInterface {
  /**
   * Returns true when the session's token count has crossed the compression
   * threshold (COMPRESSION_THRESHOLD * contextLimit).
   */
  readonly shouldCompress: (input: {
    sessionID: SessionID
    currentTokenCount: number
    contextLimit: number
  }) => Effect.Effect<boolean>

  /**
   * Compress a session using the given strategy.
   * Returns how many tokens were freed and how many messages were compressed.
   *
   * Strategies:
   *   prune    — mark old tool-call results as compressed (no LLM)
   *   abstract — summarise old assistant text messages to 1-2 sentences (LLM)
   *   summary  — collapse oldest 20 messages into a system message (LLM)
   *   auto     — try prune → abstract → summary until enough tokens freed
   */
  readonly compress: (input: {
    sessionID: SessionID
    strategy: "prune" | "abstract" | "summary" | "auto"
    focusMessageCount?: number
  }) => Effect.Effect<{ tokensFreed: number; messagesCompressed: number }>
}

export class CompressionService extends Context.Service<CompressionService, CompressionInterface>()(
  "@openloom/CompressionService",
) {}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

/**
 * Prune strategy: mark tool-call result messages older than the focus window
 * as compressed. No LLM call. Estimated tokens freed = 200 per message.
 */
function pruneStrategy(
  messages: MessageRow[],
  focusCount: number,
): { tokensFreed: number; messagesCompressed: number } {
  const candidates = messages.slice(0, Math.max(0, messages.length - focusCount))
  let freed = 0
  let compressed = 0
  for (const row of candidates) {
    if ((row as any).compressed) continue
    if (!isToolResult(row)) continue
    markCompressed(row.id)
    freed += 200  // rough estimate
    compressed++
  }
  return { tokensFreed: freed, messagesCompressed: compressed }
}

/**
 * Abstract strategy: call the LLM to compress each old assistant text message
 * to 1-2 sentences. Updates message data in-place. Estimated tokens freed =
 * 80% of original character count / 4 (rough chars-to-tokens).
 */
async function abstractStrategy(
  messages: MessageRow[],
  focusCount: number,
): Promise<{ tokensFreed: number; messagesCompressed: number }> {
  const candidates = messages
    .slice(0, Math.max(0, messages.length - focusCount))
    .filter((r) => !(r as any).compressed && !isToolResult(r))

  let freed = 0
  let compressed = 0

  for (const row of candidates) {
    const original = extractText(row)
    if (original.length < 200) continue  // too short to bother

    const prompt = `Compress this assistant message to its key decisions and facts in 1-2 sentences:\n\n${original}`
    try {
      const summary = await callCompressionModel(prompt)
      overwriteText(row, summary)
      markCompressed(row.id)
      const charsFreed = Math.max(0, original.length - summary.length)
      freed += Math.floor(charsFreed / 4)  // rough chars-to-tokens
      compressed++
    } catch {
      // Skip on error — compression is best-effort.
    }
  }

  return { tokensFreed: freed, messagesCompressed: compressed }
}

/**
 * Summary strategy: collapse the oldest SUMMARY_BATCH messages into a single
 * system-role context note. Marks originals as compressed. Inserts the new
 * summary message at the position of the first original (time_created - 1).
 */
async function summaryStrategy(
  sessionID: string,
  messages: MessageRow[],
  focusCount: number,
): Promise<{ tokensFreed: number; messagesCompressed: number }> {
  const available = messages
    .slice(0, Math.max(0, messages.length - focusCount))
    .filter((r) => !(r as any).compressed)

  if (available.length === 0) return { tokensFreed: 0, messagesCompressed: 0 }

  const batch = available.slice(0, SUMMARY_BATCH)
  const serialized = batch
    .map((r) => {
      const data = r.data as any
      const role = data?.role ?? "unknown"
      const text = extractText(r)
      return `[${role}]: ${text}`
    })
    .join("\n\n---\n\n")

  const prompt = `Summarize this conversation segment as a brief context note (3-5 bullet points):\n\n${serialized}`
  let summaryText: string
  try {
    summaryText = await callCompressionModel(prompt)
  } catch {
    return { tokensFreed: 0, messagesCompressed: 0 }
  }

  // Insert a synthetic system message just before the first batch message.
  const firstRow = batch[0]!
  const insertedAt = (firstRow.time_created ?? Date.now()) - 1
  const newID = `cmpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  Database.use((db) =>
    db
      .insert(MessageTable)
      .values({
        id: newID as any,
        session_id: sessionID as any,
        time_created: insertedAt,
        time_updated: Date.now(),
        compressed: 0,
        data: {
          role: "system",
          id: newID,
          sessionID,
          text: `[Context summary]\n${summaryText}`,
        } as any,
      })
      .run(),
  )

  // Mark all batch messages as compressed.
  let freed = 0
  for (const row of batch) {
    const text = extractText(row)
    freed += Math.floor(text.length / 4)
    markCompressed(row.id)
  }

  return { tokensFreed: freed, messagesCompressed: batch.length }
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer: Layer.Layer<CompressionService, never, never> = Layer.effect(
  CompressionService,
  Effect.gen(function* () {
    const shouldCompress: CompressionInterface["shouldCompress"] = Effect.fn(
      "CompressionService.shouldCompress",
    )(function* (input) {
      return input.currentTokenCount >= input.contextLimit * COMPRESSION_THRESHOLD
    })

    const compress: CompressionInterface["compress"] = Effect.fn("CompressionService.compress")(
      function* (input) {
        const focus = input.focusMessageCount ?? DEFAULT_FOCUS
        const messages = getMessages(input.sessionID)

        if (input.strategy === "prune") {
          return pruneStrategy(messages, focus)
        }

        if (input.strategy === "abstract") {
          return yield* Effect.tryPromise(() => abstractStrategy(messages, focus))
        }

        if (input.strategy === "summary") {
          return yield* Effect.tryPromise(() => summaryStrategy(input.sessionID, messages, focus))
        }

        // "auto": prune first, then abstract, then summary.
        const pruneResult = pruneStrategy(getMessages(input.sessionID), focus)
        if (pruneResult.tokensFreed > 0) {
          return pruneResult
        }

        const abstractResult = yield* Effect.tryPromise(() =>
          abstractStrategy(getMessages(input.sessionID), focus),
        )
        if (abstractResult.tokensFreed > 0) {
          return abstractResult
        }

        return yield* Effect.tryPromise(() =>
          summaryStrategy(input.sessionID, getMessages(input.sessionID), focus),
        )
      },
    )

    return CompressionService.of({ shouldCompress, compress })
  }),
)

export const defaultLayer = layer
```

### Verification checklist

- [ ] File exists at `packages/opencode/src/intelligence/compression/compression.ts`
- [ ] `shouldCompress` uses `COMPRESSION_THRESHOLD` constant (0.75)
- [ ] `pruneStrategy` targets only tool-result messages
- [ ] `abstractStrategy` skips messages shorter than 200 chars
- [ ] `summaryStrategy` inserts a synthetic system message then marks originals compressed
- [ ] `auto` strategy cascades prune → abstract → summary
- [ ] TypeScript compiles: `cd packages/opencode && bun typecheck`

---

## Task 5 — Write `test/intelligence/compression.test.ts`

### Step 5.1 — Write the test file

Create `packages/opencode/test/intelligence/compression.test.ts`:

```typescript
// packages/opencode/test/intelligence/compression.test.ts

import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"
import { CompressionService, layer as compressionLayer } from "../../src/intelligence/compression/compression"
import { Database, eq } from "@/storage/db"
import { MessageTable } from "@/session/session.sql"
import { SessionID, MessageID } from "@/session/schema"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSessionID(): SessionID {
  return `test_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` as SessionID
}

function insertMessage(sessionID: SessionID, role: string, text: string, isToolResult = false): string {
  const id = `test_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const data: any = isToolResult
    ? { role: "tool", id, sessionID, text }
    : { role, id, sessionID, text }
  Database.use((db) =>
    db
      .insert(MessageTable)
      .values({
        id: id as any,
        session_id: sessionID as any,
        time_created: Date.now(),
        time_updated: Date.now(),
        compressed: 0,
        data: data as any,
      })
      .run(),
  )
  return id
}

function isCompressed(messageID: string): boolean {
  const row = Database.use((db) =>
    db.select().from(MessageTable).where(eq(MessageTable.id, messageID as any)).get(),
  )
  return (row as any)?.compressed === 1
}

function countMessages(sessionID: SessionID): number {
  return Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID as any))
      .all(),
  ).length
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const it = testEffect(compressionLayer)

describe("CompressionService.shouldCompress", () => {
  it.live(
    "returns true when token count exceeds 75% of context limit",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const result = yield* svc.shouldCompress({
          sessionID: makeSessionID(),
          currentTokenCount: 76_000,
          contextLimit: 100_000,
        })
        expect(result).toBe(true)
      }),
    10_000,
  )

  it.live(
    "returns false when token count is below 75% of context limit",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const result = yield* svc.shouldCompress({
          sessionID: makeSessionID(),
          currentTokenCount: 50_000,
          contextLimit: 100_000,
        })
        expect(result).toBe(false)
      }),
    10_000,
  )

  it.live(
    "returns true exactly at the threshold",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const result = yield* svc.shouldCompress({
          sessionID: makeSessionID(),
          currentTokenCount: 75_000,
          contextLimit: 100_000,
        })
        expect(result).toBe(true)
      }),
    10_000,
  )
})

describe("CompressionService.compress — prune strategy", () => {
  it.live(
    "marks old tool-result messages as compressed",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const sid = makeSessionID()

        // Insert 12 tool-result messages and 3 regular assistant messages.
        const toolIDs: string[] = []
        for (let i = 0; i < 12; i++) {
          toolIDs.push(insertMessage(sid, "tool", `Tool output ${i}`, true))
          yield* Effect.sleep("1 millis") // ensure distinct time_created
        }
        const assistantIDs: string[] = []
        for (let i = 0; i < 3; i++) {
          assistantIDs.push(insertMessage(sid, "assistant", `Assistant message ${i}`))
          yield* Effect.sleep("1 millis")
        }

        const result = yield* svc.compress({ sessionID: sid, strategy: "prune", focusMessageCount: 5 })

        // Only tool-result messages outside the focus window should be compressed.
        expect(result.messagesCompressed).toBeGreaterThan(0)
        expect(result.tokensFreed).toBeGreaterThan(0)

        // Verify DB state: at least one tool message is marked compressed.
        const anyCompressed = toolIDs.some((id) => isCompressed(id))
        expect(anyCompressed).toBe(true)

        // Assistant messages should NOT be touched by prune.
        const assistantTouched = assistantIDs.some((id) => isCompressed(id))
        expect(assistantTouched).toBe(false)
      }),
    15_000,
  )

  it.live(
    "does not compress messages inside the focus window",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const sid = makeSessionID()

        // Insert only 3 tool-result messages (all within focus window of 5).
        const ids: string[] = []
        for (let i = 0; i < 3; i++) {
          ids.push(insertMessage(sid, "tool", `Tool output ${i}`, true))
          yield* Effect.sleep("1 millis")
        }

        const result = yield* svc.compress({ sessionID: sid, strategy: "prune", focusMessageCount: 5 })

        expect(result.messagesCompressed).toBe(0)
        expect(result.tokensFreed).toBe(0)
        for (const id of ids) {
          expect(isCompressed(id)).toBe(false)
        }
      }),
    10_000,
  )
})

describe("CompressionService.compress — summary strategy", () => {
  it.live(
    "inserts a new system summary message and marks originals compressed",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const sid = makeSessionID()

        // Insert 25 messages so summary strategy has enough to work with.
        for (let i = 0; i < 25; i++) {
          insertMessage(sid, i % 2 === 0 ? "user" : "assistant", `Message content number ${i}. `.repeat(20))
          yield* Effect.sleep("1 millis")
        }

        const before = countMessages(sid)
        const result = yield* svc.compress({
          sessionID: sid,
          strategy: "summary",
          focusMessageCount: 5,
        })

        const after = countMessages(sid)

        // A new system message should have been inserted.
        expect(after).toBe(before + 1)

        // At least one message should be compressed.
        expect(result.messagesCompressed).toBeGreaterThan(0)
        expect(result.tokensFreed).toBeGreaterThan(0)
      }),
    30_000,
  )
})

describe("CompressionService.compress — auto strategy", () => {
  it.live(
    "auto: runs prune first and returns non-zero result when tool messages exist",
    () =>
      Effect.gen(function* () {
        const svc = yield* CompressionService
        const sid = makeSessionID()

        // Insert enough tool-result messages outside the focus window.
        for (let i = 0; i < 15; i++) {
          insertMessage(sid, "tool", `Tool output ${i}`, true)
          yield* Effect.sleep("1 millis")
        }
        // Insert messages inside focus window.
        for (let i = 0; i < 5; i++) {
          insertMessage(sid, "assistant", `Recent assistant ${i}`)
          yield* Effect.sleep("1 millis")
        }

        const result = yield* svc.compress({
          sessionID: sid,
          strategy: "auto",
          focusMessageCount: 5,
        })

        // Prune should have caught the tool messages.
        expect(result.messagesCompressed).toBeGreaterThan(0)
      }),
    15_000,
  )
})
```

### Step 5.2 — Run the tests

```bash
bun test packages/opencode/test/intelligence/compression.test.ts --timeout 30000
```

Expected output (all tests passing, summary tests may be slower due to LLM calls):

```
bun test v1.x.x
packages/opencode/test/intelligence/compression.test.ts:
  CompressionService.shouldCompress
    ✓ returns true when token count exceeds 75% of context limit (Xms)
    ✓ returns false when token count is below 75% of context limit (Xms)
    ✓ returns true exactly at the threshold (Xms)
  CompressionService.compress — prune strategy
    ✓ marks old tool-result messages as compressed (Xms)
    ✓ does not compress messages inside the focus window (Xms)
  CompressionService.compress — summary strategy
    ✓ inserts a new system summary message and marks originals compressed (Xms)
  CompressionService.compress — auto strategy
    ✓ auto: runs prune first and returns non-zero result when tool messages exist (Xms)
7 pass, 0 fail
```

### Verification checklist

- [ ] All 7 tests pass
- [ ] `shouldCompress` threshold tests all pass (3 cases)
- [ ] Prune strategy tests confirm tool messages are compressed but assistant messages are not
- [ ] Summary strategy test confirms +1 message inserted and originals compressed
- [ ] Auto strategy test confirms prune runs first

---

## Task 6 — Wire router and compaction through existing session/provider paths

Do not wire a new `CompressionService` into `ToolRegistry`. The session path already calls `SessionCompaction` from `SessionPrompt`; update that path only if the enhanced compaction needs an additional option or metric.

Router integration belongs at the automatic model-selection boundary, before the final provider/model pair is chosen for an LLM request. It must:

- Return the user-selected model unchanged when a model was explicitly chosen.
- Build candidates from the existing provider catalog and current config filters.
- Filter candidates by required capabilities such as vision, reasoning, context length, and tool support.
- Record outcomes from actual provider completion/error/cost data.
- Refuse or fall back cleanly when no candidate satisfies the request.

### Step 6.1 — Locate the chat entry point in `session.ts`

The Session service in `packages/opencode/src/session/session.ts` manages messages. The `compress` hook belongs at the point where a new user message is received and before an LLM call is dispatched. In the existing codebase this is handled by the agent layer calling `Session.Service`; the cleanest injection point is to extend the `Interface` with a `checkAndCompress` helper that callers (agent.ts) can invoke.

Rather than modifying the session service interface (which is large and would require regenerating the SDK), add an `onBeforeChat` side-effect function that is exported from the session module and called from `src/agent/agent.ts` before the LLM call.

### Step 6.2 — Add `checkAndCompress` helper export to `session.ts`

Open `packages/opencode/src/session/session.ts` and, after the last `import` statement and before the first `export`, add:

```typescript
// In packages/opencode/src/session/session.ts
// Add this import near the other intelligence imports (or at the top with other imports):
import { CompressionService } from "@/intelligence/compression/compression"

// Export a convenience function that agent.ts can call.
// It is intentionally outside the Session.Service interface to keep the interface stable.
export const checkAndCompress = (input: {
  sessionID: SessionID
  currentTokenCount: number
  contextLimit: number
}) =>
  Effect.gen(function* () {
    const compression = yield* CompressionService
    const needs = yield* compression.shouldCompress(input)
    if (needs) {
      const result = yield* compression.compress({
        sessionID: input.sessionID,
        strategy: "auto",
      })
      log.info("compression applied", {
        sessionID: input.sessionID,
        tokensFreed: result.tokensFreed,
        messagesCompressed: result.messagesCompressed,
      })
    }
  }).pipe(Effect.catchAll((err) => log.warn("compression error (ignored)", { err })))
```

### Step 6.3 — Call `checkAndCompress` from `agent.ts`

Open `packages/opencode/src/agent/agent.ts`. Find the location where a new message is about to be sent to the LLM (look for `provider.language` or `streamText` or the main generation loop). Before that call, add:

```typescript
// In packages/opencode/src/agent/agent.ts
// Add import near top:
import { checkAndCompress } from "@/session/session"

// Inside the chat/run Effect.gen block, before the LLM call:
// Estimate token count from message count * average tokens per message.
const msgList = yield* session.messages({ sessionID })
const estimatedTokens = msgList.length * 800  // rough estimate; replace with real count if available
yield* checkAndCompress({
  sessionID,
  currentTokenCount: estimatedTokens,
  contextLimit: 100_000,  // replace with actual model context limit when available
})
```

### Step 6.4 — Add `CompressionService` to the layer dependency chain

Open `packages/opencode/src/tool/registry.ts`. In the `layer` definition, add `CompressionService` to the requirements and provide it:

```typescript
// In packages/opencode/src/tool/registry.ts
// Add import:
import { CompressionService } from "@/intelligence/compression/compression"

// In the Layer.Layer type signature, add CompressionService.Service to the third type parameter
// (the requirements list). Then at the bottom where defaultLayer is assembled, add:
export const defaultLayer = layer.pipe(
  // ... existing provides ...
  Layer.provide(CompressionService.defaultLayer),
)
```

### Verification checklist

- [ ] `checkAndCompress` is exported from `session.ts`
- [ ] `agent.ts` calls `checkAndCompress` before the LLM dispatch
- [ ] `CompressionService.defaultLayer` is provided in the registry layer chain
- [ ] TypeScript compiles: `cd packages/opencode && bun typecheck`

---

## Task 7 — Wire RouterService into registry + create `src/intelligence/index.ts`

### Step 7.1 — Create the barrel export

Create `packages/opencode/src/intelligence/index.ts`:

```typescript
// packages/opencode/src/intelligence/index.ts

export { RouterService, layer as routerLayer, defaultLayer as routerDefaultLayer } from "./router/router"
export type { RouterInterface } from "./router/router"
export { MODEL_METADATA, getModelMeta } from "./router/router.config"
export type { ModelMeta } from "./router/router.config"
export {
  CompressionService,
  layer as compressionLayer,
  defaultLayer as compressionDefaultLayer,
} from "./compression/compression"
export type { CompressionInterface } from "./compression/compression"
```

### Step 7.2 — Wire RouterService into `registry.ts`

Open `packages/opencode/src/tool/registry.ts`.

**7.2a — Add the import** (near the top, after existing imports):

```typescript
import { RouterService, defaultLayer as routerDefaultLayer } from "@/intelligence/index"
```

**7.2b — Add `RouterService.Service` to the layer requirements** in the `Layer.Layer` type annotation for `layer`. The existing third parameter is a union of service types — add `| RouterService.Service` to that union.

**7.2c — Yield the service** in the `Effect.gen` body of `layer` to make it available to tool implementations:

```typescript
// Inside the Effect.gen function* () { ... } body of layer:
const routerSvc = yield* RouterService
```

**7.2d — Provide the defaultLayer** in `defaultLayer` or wherever other `defaultLayer`s are chained:

```typescript
// At the bottom of registry.ts, wherever defaultLayer is declared:
export const defaultLayer = layer.pipe(
  // ... existing provides (Config, Plugin, etc.) ...
  Layer.provide(routerDefaultLayer),
)
```

### Step 7.3 — Expose RouterService via a tool (optional but useful)

If you want agents to be able to call the router directly via tool calls, you may optionally create `src/tool/router_select.ts` following the tool pattern. This is optional — the service is already available in-process. Skip this step unless the product spec requires it.

### Verification checklist

- [ ] `src/intelligence/index.ts` exists and re-exports all public symbols
- [ ] `registry.ts` imports `RouterService` and `routerDefaultLayer`
- [ ] `RouterService` is yielded in the registry layer body
- [ ] `routerDefaultLayer` is provided in the registry's layer chain
- [ ] TypeScript compiles: `cd packages/opencode && bun typecheck`

---

## Task 8 — Commit all

### Step 8.1 — Verify everything compiles and tests pass

```bash
cd packages/opencode && bun typecheck
```

Expected: zero errors.

```bash
bun test packages/opencode/test/intelligence/ --timeout 30000
```

Expected: router tests plus focused `SessionCompaction` enhancement tests pass.

### Step 8.2 — Stage and commit

```bash
git add \
  packages/opencode/src/intelligence/index.ts \
  packages/opencode/src/intelligence/router/router.config.ts \
  packages/opencode/src/intelligence/router/router.ts \
  packages/opencode/test/intelligence/router.test.ts \
  packages/opencode/test/session/compaction.test.ts \
  packages/opencode/src/session/compaction.ts \
  packages/opencode/src/provider/provider.ts
```

```bash
git commit -m "feat: add provider-aware router and compaction enhancements"
```

### Verification checklist

- [ ] `git status` is clean (no untracked intelligence files)
- [ ] Commit message follows project style
- [ ] CI passes (if CI is configured)

---

## Summary of all files created/modified

| Action | Path |
|--------|------|
| CREATE | `packages/opencode/src/intelligence/index.ts` |
| CREATE | `packages/opencode/src/intelligence/router/router.config.ts` |
| CREATE | `packages/opencode/src/intelligence/router/router.ts` |
| CREATE | `packages/opencode/test/intelligence/router.test.ts` |
| MODIFY | `packages/opencode/src/session/compaction.ts` (Hermes-style safe compaction improvements) |
| MODIFY | `packages/opencode/src/provider/provider.ts` or the automatic model-selection call site |
| MODIFY | `packages/opencode/src/tool/registry.ts` only if router policy is exposed as a tool dependency |

## Test commands reference

```bash
# All intelligence tests
bun test packages/opencode/test/intelligence/ --timeout 30000

# Router only
bun test packages/opencode/test/intelligence/router.test.ts --timeout 15000

# Compaction only
bun test packages/opencode/test/session/compaction.test.ts --timeout 30000

# Full type-check
cd packages/opencode && bun typecheck
```
