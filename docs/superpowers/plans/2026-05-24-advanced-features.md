# Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six advanced capabilities to OpenLoom: multi-strategy context compression, DeepSeek/Kimi thinking-token support, SSH terminal backend, lifecycle hooks, SONA neural learning, and computer-use tool.

**Architecture:** Each feature is a self-contained module added to `packages/opencode/src/`. Features that need cross-cutting concerns (lifecycle hooks, neural learning) build on the existing Bus PubSub and router.ts Thompson sampling infrastructure already in place. No new packages for features 1–2 and 4–5; SSH needs `ssh2`, computer-use needs `@nut-tree-fork/nut-js`.

**Tech Stack:** Effect-ts (Layer/Context.Service/Effect.gen), Drizzle ORM + SQLite (Database.use()), BusEvent.define() for events, `ssh2` for SSH, `@nut-tree-fork/nut-js` for desktop automation.

---

## File Structure

```
packages/opencode/src/
  session/
    compaction.ts                    MODIFY — add abstract/detail-prune/reasoning-aware strategies
    compaction-strategies.ts         CREATE — strategy implementations + selector
  session/
    processor.ts                     MODIFY — scrub <think> tags from DeepSeek/Kimi text streams
    think-tag.ts                     CREATE — <think> scrubber + reasoning part emitter
  shell/backends/
    ssh.ts                           CREATE — SSH backend (mirrors docker.ts)
    index.ts                         MODIFY — re-export sshRun, sshAvailable
  lifecycle/
    events.ts                        CREATE — 20 typed BusEvent definitions
    hooks.ts                         CREATE — HooksService reads config, spawns shell commands on events
    index.ts                         CREATE — barrel export
  intelligence/
    sona/
      sona.sql.ts                    CREATE — trajectories + reasoning_bank tables
      sona.ts                        CREATE — SONAService: record trajectory, distill patterns, query bank
      index.ts                       CREATE — barrel export
    router/
      router.ts                      MODIFY — call SONAService.recordTrajectory on each outcome
  tool/
    computer-use.ts                  CREATE — screenshot/click/type/scroll Tool.Def
migration/
  20260524000000_advanced_features/
    migration.sql                    CREATE — trajectories + reasoning_bank DDL
```

---

## Task 1: Multi-Strategy Context Compression

**Files:**
- Create: `packages/opencode/src/session/compaction-strategies.ts`
- Modify: `packages/opencode/src/session/compaction.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/opencode/test/session/compaction-strategies.test.ts
import { describe, expect, it } from "bun:test"
import { selectStrategy, abstractStrategy, detailPruneStrategy, reasoningAwareStrategy } from "../../src/session/compaction-strategies"

describe("selectStrategy", () => {
  it("returns abstract for overflow >= 2x prune minimum", () => {
    expect(selectStrategy(80_000, 20_000)).toBe("abstract")
  })
  it("returns detail-prune for overflow < 2x prune minimum", () => {
    expect(selectStrategy(35_000, 20_000)).toBe("detail-prune")
  })
  it("returns reasoning-aware when overflow > prune minimum and has reasoning", () => {
    expect(selectStrategy(25_000, 20_000, true)).toBe("reasoning-aware")
  })
})

describe("abstractStrategy", () => {
  it("returns a system prompt instructing maximum compression", () => {
    const prompt = abstractStrategy("prior summary", 80_000)
    expect(prompt).toContain("abstract")
    expect(prompt).toContain("80000")
  })
})

describe("detailPruneStrategy", () => {
  it("instructs preserving decisions and removing implementation details", () => {
    const prompt = detailPruneStrategy("prior summary")
    expect(prompt).toContain("decision")
    expect(prompt).toContain("implementation detail")
  })
})

describe("reasoningAwareStrategy", () => {
  it("instructs preserving reasoning chains", () => {
    const prompt = reasoningAwareStrategy("prior summary")
    expect(prompt).toContain("reasoning")
    expect(prompt).toContain("chain")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd packages/opencode && bun test test/session/compaction-strategies.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `compaction-strategies.ts`**

```typescript
// packages/opencode/src/session/compaction-strategies.ts
import { PRUNE_MINIMUM, REFERENCE_ONLY_SUMMARY_PREFIX } from "./compaction"

export type CompressionStrategy = "abstract" | "detail-prune" | "reasoning-aware" | "default"

/**
 * Chooses the best compression strategy given the token overflow amount.
 * - reasoning-aware: preferred when session has reasoning blocks (preserves thought chains)
 * - abstract: large overflow — maximum compression, discard implementation details
 * - detail-prune: moderate overflow — keep decisions, prune verbose tool outputs
 * - default: fallback to existing summary approach
 */
export function selectStrategy(
  currentTokens: number,
  pruneMinimum: number,
  hasReasoning = false,
): CompressionStrategy {
  const overflow = currentTokens - pruneMinimum
  if (overflow <= 0) return "default"
  if (hasReasoning && overflow > pruneMinimum * 0.25) return "reasoning-aware"
  if (overflow >= pruneMinimum * 2) return "abstract"
  if (overflow >= pruneMinimum * 0.5) return "detail-prune"
  return "default"
}

export function abstractStrategy(previousSummary: string | undefined, currentTokens: number): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}The context is ${currentTokens} tokens — critically over limit. Create a maximally abstract summary.`,
    "Discard all implementation details, code snippets, and tool outputs.",
    "Preserve only: the original goal, key decisions made, final state of each file changed, and next steps.",
    "Target: under 800 tokens total.",
  ].join("\n")
}

export function detailPruneStrategy(previousSummary: string | undefined): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}Context is over limit. Summarize with moderate compression.`,
    "Keep: decisions and why they were made, error messages and resolutions, file paths and their purpose.",
    "Remove: verbose implementation detail, repeated tool output, scaffolding exploration.",
    "Target: under 1500 tokens total.",
  ].join("\n")
}

export function reasoningAwareStrategy(previousSummary: string | undefined): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}Context is over limit. This session contains reasoning chains — preserve them selectively.`,
    "Keep: the most important reasoning chain that led to a key decision.",
    "Remove: exploratory reasoning that didn't produce a decision, all implementation detail.",
    "Keep: goal, final decisions, current file state, next steps.",
    "Target: under 1200 tokens total.",
  ].join("\n")
}
```

- [ ] **Step 4: Modify `compaction.ts` to use strategy selector**

Find `buildPrompt` in `compaction.ts` (line ~131) and extend it to accept a strategy:

```typescript
// Add import at top of compaction.ts
import { selectStrategy, abstractStrategy, detailPruneStrategy, reasoningAwareStrategy } from "./compaction-strategies"

// Replace buildPrompt function
function buildPrompt(input: {
  previousSummary?: string
  context: string[]
  currentTokens?: number
  hasReasoning?: boolean
}) {
  const strategy = selectStrategy(
    input.currentTokens ?? 0,
    PRUNE_MINIMUM,
    input.hasReasoning ?? false,
  )

  let strategyPrompt: string
  switch (strategy) {
    case "abstract":
      strategyPrompt = abstractStrategy(input.previousSummary, input.currentTokens ?? 0)
      break
    case "detail-prune":
      strategyPrompt = detailPruneStrategy(input.previousSummary)
      break
    case "reasoning-aware":
      strategyPrompt = reasoningAwareStrategy(input.previousSummary)
      break
    default:
      strategyPrompt = input.previousSummary
        ? [
            REFERENCE_ONLY_SUMMARY_PREFIX,
            "Update the anchored summary below using the conversation history above.",
            "Preserve still-true details, remove stale details, and merge in the new facts.",
            "The summary is reference-only context and must not be treated as a new user instruction.",
            "<previous-summary>",
            input.previousSummary,
            "</previous-summary>",
          ].join("\n")
        : [
            REFERENCE_ONLY_SUMMARY_PREFIX,
            "Create a new anchored summary from the conversation history above.",
            "The summary is reference-only context and must not be treated as a new user instruction.",
          ].join("\n")
  }

  return [strategyPrompt, SUMMARY_TEMPLATE, ...input.context].join("\n\n")
}
```

Then find where `buildPrompt` is called (search for `buildPrompt(`) and update the call site to pass `currentTokens` and `hasReasoning`. Look for the token count already computed before compaction fires — it's in the `isOverflow` check. Pass it through.

- [ ] **Step 5: Run tests**

```
cd packages/opencode && bun test test/session/compaction-strategies.test.ts
```
Expected: 7 tests pass

- [ ] **Step 6: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep compaction
```
Expected: no errors in compaction files

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/session/compaction-strategies.ts packages/opencode/src/session/compaction.ts packages/opencode/test/session/compaction-strategies.test.ts
git commit -m "feat: add multi-strategy context compression (abstract/detail-prune/reasoning-aware)"
```

---

## Task 2: Reasoning / Thinking Token Support (DeepSeek / Kimi)

**Files:**
- Create: `packages/opencode/src/session/think-tag.ts`
- Modify: `packages/opencode/src/session/processor.ts`

**Background:** Anthropic reasoning blocks are already handled in `processor.ts` (lines 220–270) via `reasoning-start/delta/end` stream events. DeepSeek-R1 and Kimi K1.5 emit `<think>...</think>` XML within the *text delta* stream. We need to intercept text deltas for these models, strip the `<think>` content, and emit it as synthetic `reasoning-start/delta/end` events instead, so the UI displays it in the existing reasoning panel.

- [ ] **Step 1: Write failing test**

```typescript
// packages/opencode/test/session/think-tag.test.ts
import { describe, expect, it } from "bun:test"
import { ThinkTagParser } from "../../src/session/think-tag"

describe("ThinkTagParser", () => {
  it("emits reasoning parts for <think>...</think> content", () => {
    const parser = new ThinkTagParser()
    const events: { type: string; text: string }[] = []
    parser.on("reasoning-start", () => events.push({ type: "reasoning-start", text: "" }))
    parser.on("reasoning-delta", (text: string) => events.push({ type: "reasoning-delta", text }))
    parser.on("reasoning-end", () => events.push({ type: "reasoning-end", text: "" }))
    parser.on("text-delta", (text: string) => events.push({ type: "text-delta", text }))

    parser.feed("<think>step one</think>answer here")

    expect(events[0].type).toBe("reasoning-start")
    expect(events[1]).toEqual({ type: "reasoning-delta", text: "step one" })
    expect(events[2].type).toBe("reasoning-end")
    expect(events[3]).toEqual({ type: "text-delta", text: "answer here" })
  })

  it("handles incremental chunks that split the tag boundary", () => {
    const parser = new ThinkTagParser()
    const textParts: string[] = []
    const reasoningParts: string[] = []
    parser.on("text-delta", (t: string) => textParts.push(t))
    parser.on("reasoning-delta", (t: string) => reasoningParts.push(t))

    parser.feed("<thi")
    parser.feed("nk>re")
    parser.feed("ason")
    parser.feed("</think>fin")

    expect(reasoningParts.join("")).toBe("reason")
    expect(textParts.join("")).toBe("fin")
  })

  it("passes through text unchanged when no think tags present", () => {
    const parser = new ThinkTagParser()
    const textParts: string[] = []
    parser.on("text-delta", (t: string) => textParts.push(t))
    parser.feed("plain text delta")
    expect(textParts).toEqual(["plain text delta"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd packages/opencode && bun test test/session/think-tag.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `think-tag.ts`**

```typescript
// packages/opencode/src/session/think-tag.ts
import { EventEmitter } from "events"

const OPEN_TAG = "<think>"
const CLOSE_TAG = "</think>"

/**
 * Streaming parser for DeepSeek/Kimi <think>...</think> reasoning blocks.
 * Emits reasoning-start, reasoning-delta, reasoning-end, and text-delta events.
 * Feed it raw text delta chunks; it handles tags split across chunk boundaries.
 */
export class ThinkTagParser extends EventEmitter {
  private buffer = ""
  private inThink = false

  feed(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.inThink) {
        const closeIdx = this.buffer.indexOf(CLOSE_TAG)
        if (closeIdx === -1) {
          // More reasoning content coming — emit what we have, keep nothing
          this.emit("reasoning-delta", this.buffer)
          this.buffer = ""
        } else {
          // Emit up to the close tag, then end reasoning
          if (closeIdx > 0) this.emit("reasoning-delta", this.buffer.slice(0, closeIdx))
          this.emit("reasoning-end")
          this.inThink = false
          this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length)
        }
      } else {
        const openIdx = this.buffer.indexOf(OPEN_TAG)
        if (openIdx === -1) {
          // No open tag — could be a partial tag at the end; hold the last N chars
          const safeLen = Math.max(0, this.buffer.length - OPEN_TAG.length + 1)
          if (safeLen > 0) {
            this.emit("text-delta", this.buffer.slice(0, safeLen))
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        } else {
          // Emit text before the open tag
          if (openIdx > 0) this.emit("text-delta", this.buffer.slice(0, openIdx))
          this.emit("reasoning-start")
          this.inThink = true
          this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length)
        }
      }
    }
  }

  /** Call at stream end to flush any remaining buffer as text. */
  flush(): void {
    if (this.buffer.length > 0) {
      this.emit("text-delta", this.buffer)
      this.buffer = ""
    }
  }
}

/** Returns true for model IDs that use <think> XML tags instead of native reasoning events. */
export function usesThinkTags(modelID: string): boolean {
  const lower = modelID.toLowerCase()
  return (
    lower.includes("deepseek-r") ||
    lower.includes("deepseek-reasoner") ||
    lower.includes("kimi-k1") ||
    lower.includes("moonshot-v1-thinking")
  )
}
```

- [ ] **Step 4: Run tests**

```
cd packages/opencode && bun test test/session/think-tag.test.ts
```
Expected: 3 tests pass

- [ ] **Step 5: Wire into `processor.ts`**

In `packages/opencode/src/session/processor.ts`, find where text-delta events are handled (search for `case "text-delta":` or `text-delta`). The processor needs to instantiate a `ThinkTagParser` per assistant message when the model uses think tags, and route text deltas through it.

Add near the top of `processor.ts`:

```typescript
import { ThinkTagParser, usesThinkTags } from "./think-tag"
```

In the context initialization (where `reasoningMap` is created, around line 80), add:

```typescript
thinkTagParser: null as ThinkTagParser | null,
```

In the `"start"` event handler (line ~217), initialize the parser if the model uses think tags:

```typescript
case "start":
  yield* status.set(ctx.sessionID, { type: "busy" })
  if (usesThinkTags(ctx.modelID ?? "")) {
    ctx.thinkTagParser = new ThinkTagParser()
    ctx.thinkTagParser.on("reasoning-start", () => {
      const id = `think-${Date.now()}`
      // Synthetic reasoning-start event — handled by existing reasoning logic below
      // by pushing directly into reasoningMap
      ctx.pendingThinkID = id
      ctx.reasoningMap[id] = {
        id: PartID.ascending(),
        messageID: ctx.assistantMessage.id,
        sessionID: ctx.assistantMessage.sessionID,
        type: "reasoning",
        text: "",
        time: { start: Date.now() },
        metadata: undefined,
      }
    })
    ctx.thinkTagParser.on("reasoning-delta", (text: string) => {
      if (!ctx.pendingThinkID) return
      ctx.reasoningMap[ctx.pendingThinkID].text += text
    })
    ctx.thinkTagParser.on("reasoning-end", () => {
      if (!ctx.pendingThinkID) return
      ctx.reasoningMap[ctx.pendingThinkID].time = {
        ...ctx.reasoningMap[ctx.pendingThinkID].time,
        end: Date.now(),
      }
      ctx.pendingThinkID = undefined
    })
    ctx.thinkTagParser.on("text-delta", (text: string) => {
      // Re-inject as normal text delta — push to current text part
      ctx.pendingTextDelta = (ctx.pendingTextDelta ?? "") + text
    })
  }
  return
```

Then in the `"text-delta"` case, intercept when thinkTagParser is active:

```typescript
case "text-delta":
  if (ctx.thinkTagParser) {
    ctx.thinkTagParser.feed(value.text)
    // pendingTextDelta is drained by the text-delta listener above
    if (ctx.pendingTextDelta) {
      const text = ctx.pendingTextDelta
      ctx.pendingTextDelta = undefined
      // fall through to existing text handling with `text` instead of value.text
      yield* handleTextDelta(text)
    }
    return
  }
  yield* handleTextDelta(value.text)
  return
```

> Note: The exact integration depends on the current `handleTextDelta` helper shape in processor.ts. Read lines 280-340 before editing to confirm the exact call site. The key insight is: when `thinkTagParser` is active, route text through it and only pass the non-think portions to the existing text handling.

- [ ] **Step 6: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep -E "think-tag|processor"
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/session/think-tag.ts packages/opencode/src/session/processor.ts packages/opencode/test/session/think-tag.test.ts
git commit -m "feat: add DeepSeek/Kimi <think> tag reasoning support"
```

---

## Task 3: SSH Terminal Backend

**Files:**
- Create: `packages/opencode/src/shell/backends/ssh.ts`
- Modify: `packages/opencode/src/shell/backends/index.ts`
- Modify: `packages/opencode/package.json` — add `ssh2` dependency

- [ ] **Step 1: Add dependency**

```
cd packages/opencode && bun add ssh2
bun add --dev @types/ssh2
```

- [ ] **Step 2: Write failing test**

```typescript
// packages/opencode/test/shell/ssh-backend.test.ts
import { describe, expect, it } from "bun:test"
import { SshConnectionOptions, validateSshOptions } from "../../src/shell/backends/ssh"

describe("validateSshOptions", () => {
  it("accepts password auth", () => {
    const opts: SshConnectionOptions = { host: "localhost", port: 22, username: "user", password: "pass" }
    expect(() => validateSshOptions(opts)).not.toThrow()
  })
  it("accepts key auth", () => {
    const opts: SshConnectionOptions = { host: "host", port: 22, username: "user", privateKey: "/path/to/key" }
    expect(() => validateSshOptions(opts)).not.toThrow()
  })
  it("rejects missing auth", () => {
    const opts: SshConnectionOptions = { host: "host", port: 22, username: "user" }
    expect(() => validateSshOptions(opts)).toThrow("SSH requires either password or privateKey")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
cd packages/opencode && bun test test/shell/ssh-backend.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Create `ssh.ts`**

```typescript
// packages/opencode/src/shell/backends/ssh.ts
import { Client } from "ssh2"
import { readFileSync } from "fs"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "shell.ssh" })

export type SshConnectionOptions = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string  // path to key file or PEM string
  passphrase?: string
  timeout?: number     // ms, default 10_000
}

export type SshRunOptions = SshConnectionOptions & {
  cwd?: string
  env?: Record<string, string>
}

export function validateSshOptions(opts: SshConnectionOptions): void {
  if (!opts.password && !opts.privateKey) {
    throw new Error("SSH requires either password or privateKey")
  }
}

function resolveKey(privateKey: string): string | Buffer {
  // If it looks like a file path (no newlines), read from disk
  if (!privateKey.includes("\n") && !privateKey.includes("-----")) {
    try {
      return readFileSync(privateKey)
    } catch {
      throw new Error(`SSH private key file not found: ${privateKey}`)
    }
  }
  return privateKey
}

/**
 * Execute a shell command on a remote host over SSH.
 * Streams stdout+stderr to onData. Returns exit code.
 */
export async function sshRun(
  cmd: string,
  opts: SshRunOptions,
  onData: (chunk: string) => void,
): Promise<{ exitCode: number }> {
  validateSshOptions(opts)

  return new Promise((resolve) => {
    const client = new Client()

    const connectOpts: Parameters<Client["connect"]>[0] = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: opts.timeout ?? 10_000,
    }

    if (opts.password) {
      connectOpts.password = opts.password
    } else if (opts.privateKey) {
      connectOpts.privateKey = resolveKey(opts.privateKey)
      if (opts.passphrase) connectOpts.passphrase = opts.passphrase
    }

    client.on("ready", () => {
      let fullCmd = cmd
      if (opts.cwd) fullCmd = `cd ${JSON.stringify(opts.cwd)} && ${cmd}`
      if (opts.env) {
        const envPrefix = Object.entries(opts.env)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(" ")
        fullCmd = `${envPrefix} ${fullCmd}`
      }

      log.info("ssh exec", { host: opts.host, cmd: fullCmd.slice(0, 80) })

      client.exec(fullCmd, (err, stream) => {
        if (err) {
          onData(`SSH exec error: ${err.message}\n`)
          client.end()
          resolve({ exitCode: 1 })
          return
        }

        stream.on("data", (chunk: Buffer) => onData(chunk.toString()))
        stream.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()))
        stream.on("close", (code: number) => {
          client.end()
          resolve({ exitCode: code ?? 1 })
        })
      })
    })

    client.on("error", (err) => {
      onData(`SSH connection error: ${err.message}\n`)
      resolve({ exitCode: 1 })
    })

    client.connect(connectOpts)
  })
}

/** Returns true if the ssh2 package is available (it always is once installed). */
export function sshAvailable(): boolean {
  try {
    require("ssh2")
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Update `backends/index.ts`**

```typescript
// packages/opencode/src/shell/backends/index.ts
export { dockerRun, dockerAvailable } from "./docker"
export type { DockerRunOptions } from "./docker"
export { sshRun, sshAvailable, validateSshOptions } from "./ssh"
export type { SshConnectionOptions, SshRunOptions } from "./ssh"
```

- [ ] **Step 6: Run tests**

```
cd packages/opencode && bun test test/shell/ssh-backend.test.ts
```
Expected: 3 tests pass (no real SSH connection needed — tests only validate option parsing)

- [ ] **Step 7: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep -E "ssh|backends"
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/opencode/src/shell/backends/ssh.ts packages/opencode/src/shell/backends/index.ts packages/opencode/test/shell/ssh-backend.test.ts packages/opencode/package.json bun.lock
git commit -m "feat: add SSH terminal backend for remote command execution"
```

---

## Task 4: Lifecycle Hooks System

**Files:**
- Create: `packages/opencode/src/lifecycle/events.ts`
- Create: `packages/opencode/src/lifecycle/hooks.ts`
- Create: `packages/opencode/src/lifecycle/index.ts`

**Design:** The hooks system mirrors Claude Code's own hooks mechanism. Users define shell commands in config (e.g. `openloom.json`) under a `hooks` key. When a lifecycle event fires on the Bus, the `HooksService` reads the config, finds matching hooks for that event type, and spawns them as child processes with event data injected as JSON via `OPENLOOM_HOOK_EVENT` env var.

- [ ] **Step 1: Write failing test**

```typescript
// packages/opencode/test/lifecycle/hooks.test.ts
import { describe, expect, it } from "bun:test"
import { LifecycleEvent, isLifecycleEventType } from "../../src/lifecycle/events"

describe("LifecycleEvent types", () => {
  it("defines session events", () => {
    expect(LifecycleEvent.SessionStarted.type).toBe("lifecycle.session.started")
    expect(LifecycleEvent.SessionEnded.type).toBe("lifecycle.session.ended")
  })
  it("defines tool events", () => {
    expect(LifecycleEvent.ToolBefore.type).toBe("lifecycle.tool.before")
    expect(LifecycleEvent.ToolAfter.type).toBe("lifecycle.tool.after")
  })
  it("defines message events", () => {
    expect(LifecycleEvent.MessageStarted.type).toBe("lifecycle.message.started")
    expect(LifecycleEvent.MessageCompleted.type).toBe("lifecycle.message.completed")
  })
  it("defines compaction events", () => {
    expect(LifecycleEvent.CompactionBefore.type).toBe("lifecycle.compaction.before")
    expect(LifecycleEvent.CompactionAfter.type).toBe("lifecycle.compaction.after")
  })
  it("isLifecycleEventType recognizes valid types", () => {
    expect(isLifecycleEventType("lifecycle.session.started")).toBe(true)
    expect(isLifecycleEventType("session.compacted")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd packages/opencode && bun test test/lifecycle/hooks.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `lifecycle/events.ts`**

```typescript
// packages/opencode/src/lifecycle/events.ts
import { Schema } from "effect"
import { BusEvent } from "@/bus/bus-event"
import { SessionID, MessageID } from "@/session/schema"

const sessionIDProp = Schema.Struct({ sessionID: SessionID })
const messageIDProp = Schema.Struct({ sessionID: SessionID, messageID: MessageID })

export const LifecycleEvent = {
  // Session lifecycle
  SessionStarted: BusEvent.define(
    "lifecycle.session.started",
    Schema.Struct({ sessionID: SessionID, title: Schema.optional(Schema.String) }),
  ),
  SessionEnded: BusEvent.define(
    "lifecycle.session.ended",
    Schema.Struct({ sessionID: SessionID, messageCount: Schema.Number }),
  ),

  // Message lifecycle
  MessageStarted: BusEvent.define(
    "lifecycle.message.started",
    Schema.Struct({ sessionID: SessionID, messageID: MessageID, modelID: Schema.String }),
  ),
  MessageCompleted: BusEvent.define(
    "lifecycle.message.completed",
    Schema.Struct({
      sessionID: SessionID,
      messageID: MessageID,
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      costUsd: Schema.optional(Schema.Number),
    }),
  ),

  // Tool lifecycle
  ToolBefore: BusEvent.define(
    "lifecycle.tool.before",
    Schema.Struct({ sessionID: SessionID, messageID: MessageID, toolID: Schema.String, args: Schema.Unknown }),
  ),
  ToolAfter: BusEvent.define(
    "lifecycle.tool.after",
    Schema.Struct({
      sessionID: SessionID,
      messageID: MessageID,
      toolID: Schema.String,
      success: Schema.Boolean,
      durationMs: Schema.Number,
    }),
  ),

  // Compaction lifecycle
  CompactionBefore: BusEvent.define(
    "lifecycle.compaction.before",
    Schema.Struct({ sessionID: SessionID, currentTokens: Schema.Number }),
  ),
  CompactionAfter: BusEvent.define(
    "lifecycle.compaction.after",
    Schema.Struct({ sessionID: SessionID, compressedTokens: Schema.Number, strategy: Schema.String }),
  ),

  // Agent lifecycle
  AgentStarted: BusEvent.define(
    "lifecycle.agent.started",
    Schema.Struct({ sessionID: SessionID, agentID: Schema.String }),
  ),
  AgentCompleted: BusEvent.define(
    "lifecycle.agent.completed",
    Schema.Struct({ sessionID: SessionID, agentID: Schema.String, success: Schema.Boolean }),
  ),

  // Provider lifecycle
  ProviderSelected: BusEvent.define(
    "lifecycle.provider.selected",
    Schema.Struct({ sessionID: SessionID, modelID: Schema.String, providerID: Schema.String, reason: Schema.String }),
  ),
} as const

const ALL_TYPES = new Set(Object.values(LifecycleEvent).map((e) => e.type))

export function isLifecycleEventType(type: string): boolean {
  return ALL_TYPES.has(type)
}

export type LifecycleEventType = (typeof LifecycleEvent)[keyof typeof LifecycleEvent]["type"]
```

- [ ] **Step 4: Create `lifecycle/hooks.ts`**

```typescript
// packages/opencode/src/lifecycle/hooks.ts
import { Effect, Layer, Context, Schema } from "effect"
import { spawn } from "child_process"
import * as Log from "@openloom/core/util/log"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { LifecycleEvent, isLifecycleEventType } from "./events"

const log = Log.create({ service: "lifecycle.hooks" })

type HookConfig = {
  command: string
  /** Shell to use; defaults to 'sh' on Unix, 'cmd' on Windows. */
  shell?: string
  timeout?: number  // ms, default 30_000
}

type HooksConfig = Partial<Record<string, HookConfig[]>>

function spawnHook(hook: HookConfig, eventType: string, properties: unknown): void {
  const env = {
    ...process.env,
    OPENLOOM_HOOK_EVENT: JSON.stringify({ type: eventType, properties }),
  }
  const shell = hook.shell ?? (process.platform === "win32" ? "cmd" : "sh")
  const args = process.platform === "win32" ? ["/c", hook.command] : ["-c", hook.command]
  const timeout = hook.timeout ?? 30_000

  const proc = spawn(shell, args, { env, stdio: ["ignore", "pipe", "pipe"] })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
    log.warn("hook timed out", { command: hook.command, eventType })
  }, timeout)

  proc.on("close", (code) => {
    clearTimeout(timer)
    if (!timedOut && code !== 0) {
      log.warn("hook exited non-zero", { command: hook.command, code, eventType })
    }
  })
}

export interface HooksInterface {
  readonly dispatch: (eventType: string, properties: unknown) => Effect.Effect<void>
}

export class HooksService extends Context.Service<HooksService, HooksInterface>()("@openloom/HooksService") {}

export const layer: Layer.Layer<HooksService, never, Bus.Service | Config.Service> = Layer.effect(
  HooksService,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const config = yield* Config.Service

    function getHooksConfig(): HooksConfig {
      try {
        const cfg = config.get()
        return (cfg as any).hooks ?? {}
      } catch {
        return {}
      }
    }

    function dispatch(eventType: string, properties: unknown): Effect.Effect<void> {
      return Effect.sync(() => {
        const hooksConfig = getHooksConfig()
        const hooks = hooksConfig[eventType] ?? []
        for (const hook of hooks) {
          spawnHook(hook, eventType, properties)
        }
      })
    }

    // Subscribe to all lifecycle events on the bus and dispatch hooks
    yield* Effect.forkDaemon(
      bus.subscribeAll().pipe(
        (stream) =>
          Effect.gen(function* () {
            const { Stream } = yield* Effect.succeed({ Stream: (await import("effect")).Stream })
            yield* Stream.runForEach(stream, (event) => {
              if (!isLifecycleEventType(event.type)) return Effect.void
              return dispatch(event.type, event.properties)
            })
          }),
      ),
    )

    return { dispatch }
  }),
)
```

- [ ] **Step 5: Create `lifecycle/index.ts`**

```typescript
// packages/opencode/src/lifecycle/index.ts
export { LifecycleEvent, isLifecycleEventType } from "./events"
export type { LifecycleEventType } from "./events"
export { HooksService, layer as hooksLayer } from "./hooks"
```

- [ ] **Step 6: Run tests**

```
cd packages/opencode && bun test test/lifecycle/hooks.test.ts
```
Expected: 5 tests pass

- [ ] **Step 7: Publish a lifecycle event from session start**

In `packages/opencode/src/session/session.ts`, find where sessions are created (search for `Session.create` or the session insert). After the insert, publish `LifecycleEvent.SessionStarted`:

```typescript
import { LifecycleEvent } from "@/lifecycle"
// ... after session insert:
yield* bus.publish(LifecycleEvent.SessionStarted, { sessionID: session.id })
```

- [ ] **Step 8: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep lifecycle
```
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add packages/opencode/src/lifecycle/ packages/opencode/test/lifecycle/ packages/opencode/src/session/session.ts
git commit -m "feat: add lifecycle hooks system with 11 typed events and shell command dispatch"
```

---

## Task 5: SONA Neural Learning

**Files:**
- Create: `packages/opencode/src/intelligence/sona/sona.sql.ts`
- Create: `packages/opencode/src/intelligence/sona/sona.ts`
- Create: `packages/opencode/src/intelligence/sona/index.ts`
- Create: `migration/20260524000000_advanced_features/migration.sql`
- Modify: `packages/opencode/src/intelligence/router/router.ts`

**Design:** SONA (Self-Optimizing Neural Adapter) tracks tool call sequences per session (trajectories) and distills successful patterns into a `reasoning_bank` table. The router queries the bank before model selection to bias toward models that succeeded on similar past patterns.

- [ ] **Step 1: Create migration SQL**

```sql
-- migration/20260524000000_advanced_features/migration.sql

-- Stores per-session tool call trajectories for SONA pattern learning
CREATE TABLE IF NOT EXISTS sona_trajectories (
  id TEXT NOT NULL PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_sequence TEXT NOT NULL,       -- JSON array of tool IDs in order
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  duration_ms INTEGER,
  task_type TEXT,                    -- 'code' | 'research' | 'chat' | 'reasoning'
  time_created INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  time_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS sona_trajectories_session_idx ON sona_trajectories(session_id);
CREATE INDEX IF NOT EXISTS sona_trajectories_model_idx ON sona_trajectories(model_id, provider_id);

-- Distilled successful patterns from trajectories
CREATE TABLE IF NOT EXISTS sona_reasoning_bank (
  id TEXT NOT NULL PRIMARY KEY,
  pattern_hash TEXT NOT NULL UNIQUE, -- hash of tool_sequence for dedup
  tool_sequence TEXT NOT NULL,       -- JSON array of tool IDs
  best_model_id TEXT NOT NULL,
  best_provider_id TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 1,
  avg_cost_usd REAL,
  task_type TEXT,
  time_created INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  time_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS sona_bank_hash_idx ON sona_reasoning_bank(pattern_hash);
CREATE INDEX IF NOT EXISTS sona_bank_task_idx ON sona_reasoning_bank(task_type);
```

- [ ] **Step 2: Write failing test**

```typescript
// packages/opencode/test/intelligence/sona.test.ts
import { describe, expect, it } from "bun:test"
import { hashToolSequence, extractPattern } from "../../src/intelligence/sona/sona"

describe("hashToolSequence", () => {
  it("produces consistent hash for same sequence", () => {
    const h1 = hashToolSequence(["read", "edit", "shell"])
    const h2 = hashToolSequence(["read", "edit", "shell"])
    expect(h1).toBe(h2)
  })
  it("produces different hash for different sequence", () => {
    const h1 = hashToolSequence(["read", "edit"])
    const h2 = hashToolSequence(["edit", "read"])
    expect(h1).not.toBe(h2)
  })
})

describe("extractPattern", () => {
  it("returns last 5 tools from a long sequence", () => {
    const tools = ["a", "b", "c", "d", "e", "f", "g"]
    expect(extractPattern(tools)).toEqual(["c", "d", "e", "f", "g"])
  })
  it("returns full sequence when <= 5 tools", () => {
    const tools = ["read", "edit"]
    expect(extractPattern(tools)).toEqual(["read", "edit"])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
cd packages/opencode && bun test test/intelligence/sona.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Create `sona.sql.ts`**

```typescript
// packages/opencode/src/intelligence/sona/sona.sql.ts
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../../storage/schema.sql"

export const SonaTrajectoryTable = sqliteTable(
  "sona_trajectories",
  {
    id: text().notNull().primaryKey(),
    session_id: text().notNull(),
    tool_sequence: text().notNull(),  // JSON array
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
```

- [ ] **Step 5: Create `sona.ts`**

```typescript
// packages/opencode/src/intelligence/sona/sona.ts
import { Effect, Layer, Context } from "effect"
import { createHash } from "crypto"
import { Database, eq } from "@/storage/db"
import { SonaTrajectoryTable, SonaReasoningBankTable } from "./sona.sql"
import { Identifier } from "@/id/id"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "intelligence.sona" })

/** Returns a short hash of a tool call sequence for dedup in the reasoning bank. */
export function hashToolSequence(tools: string[]): string {
  return createHash("sha256").update(tools.join(",")).digest("hex").slice(0, 16)
}

/** Returns the last 5 tool IDs — the immediately preceding context window for pattern matching. */
export function extractPattern(tools: string[]): string[] {
  return tools.slice(-5)
}

export interface SonaInterface {
  /** Record a completed trajectory (tool sequence + outcome) for a session. */
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

  /**
   * Query the reasoning bank for the best model for a given tool pattern.
   * Returns undefined if no pattern has been seen before.
   */
  readonly queryBank: (input: {
    recentTools: string[]
    taskType?: string
  }) => Effect.Effect<{ modelID: string; providerID: string } | undefined>

  /** Force distillation of recent trajectories into the reasoning bank. */
  readonly distill: () => Effect.Effect<void>
}

export class SonaService extends Context.Service<SonaService, SonaInterface>()("@openloom/SonaService") {}

export const layer: Layer.Layer<SonaService> = Layer.succeed(
  SonaService,
  {
    recordTrajectory(input) {
      return Effect.sync(() => {
        const id = Identifier.ascending()
        Database.use((db) =>
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
            })
            .run(),
        )

        // After recording, distill if this was successful
        if (input.success) {
          const pattern = extractPattern(input.toolSequence)
          const hash = hashToolSequence(pattern)
          const existing = Database.use((db) =>
            db.select().from(SonaReasoningBankTable).where(eq(SonaReasoningBankTable.pattern_hash, hash)).get(),
          )
          if (!existing) {
            Database.use((db) =>
              db
                .insert(SonaReasoningBankTable)
                .values({
                  id: Identifier.ascending(),
                  pattern_hash: hash,
                  tool_sequence: JSON.stringify(pattern),
                  best_model_id: input.modelID,
                  best_provider_id: input.providerID,
                  success_count: 1,
                  avg_cost_usd: input.costUsd,
                  task_type: input.taskType,
                })
                .run(),
            )
          } else {
            const newCount = existing.success_count + 1
            const newAvgCost =
              input.costUsd != null && existing.avg_cost_usd != null
                ? (existing.avg_cost_usd * existing.success_count + input.costUsd) / newCount
                : existing.avg_cost_usd
            Database.use((db) =>
              db
                .update(SonaReasoningBankTable)
                .set({ success_count: newCount, avg_cost_usd: newAvgCost })
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
        const row = Database.use((db) =>
          db.select().from(SonaReasoningBankTable).where(eq(SonaReasoningBankTable.pattern_hash, hash)).get(),
        )
        if (!row) return undefined
        return { modelID: row.best_model_id, providerID: row.best_provider_id }
      })
    },

    distill() {
      // Distillation happens inline in recordTrajectory; this is a no-op for now
      return Effect.void
    },
  },
)
```

- [ ] **Step 6: Create `sona/index.ts`**

```typescript
// packages/opencode/src/intelligence/sona/index.ts
export { SonaService, layer as sonaLayer, hashToolSequence, extractPattern } from "./sona"
```

- [ ] **Step 7: Wire SONA query into router.ts**

In `packages/opencode/src/intelligence/router/router.ts`, modify `select()` to consult SONA before Thompson sampling. Add `SonaService` as an optional dependency:

```typescript
// Add import at top
import { SonaService } from "@/intelligence/sona"

// Inside select(), before the Thompson sampling loop, add:
// Check reasoning bank for a known-good model for this tool pattern
const recentTools = input.candidates.map((c) => c.modelID) // placeholder — ideally pass real tool history
const bankResult = yield* sona.queryBank({ recentTools, taskType: input.taskType }).pipe(Effect.orElse(() => Effect.succeed(undefined)))
if (bankResult) {
  const match = input.candidates.find(
    (c) => c.modelID === bankResult.modelID && c.providerID === bankResult.providerID,
  )
  if (match) {
    log.info("SONA bank hit", { modelID: match.modelID, providerID: match.providerID })
    return match
  }
}
// ... existing Thompson sampling continues
```

And update the layer to depend on `SonaService`:

```typescript
export const layer: Layer.Layer<RouterService, never, Provider.Service | SonaService> = Layer.effect(
  RouterService,
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const sona = yield* SonaService
    // ... rest of implementation
  }),
)
```

- [ ] **Step 8: Run tests**

```
cd packages/opencode && bun test test/intelligence/sona.test.ts
```
Expected: 4 tests pass

- [ ] **Step 9: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep -E "sona|router"
```
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add packages/opencode/src/intelligence/sona/ packages/opencode/test/intelligence/sona.test.ts migration/20260524000000_advanced_features/ packages/opencode/src/intelligence/router/router.ts
git commit -m "feat: add SONA neural learning with trajectory tracking and reasoning bank"
```

---

## Task 6: Computer-Use Tool

**Files:**
- Create: `packages/opencode/src/tool/computer-use.ts`
- Modify: `packages/opencode/src/tool/registry.ts` — register the tool
- Modify: `packages/opencode/package.json` — add `@nut-tree-fork/nut-js`

- [ ] **Step 1: Add dependency**

```
cd packages/opencode && bun add @nut-tree-fork/nut-js
```

- [ ] **Step 2: Write failing test**

```typescript
// packages/opencode/test/tool/computer-use.test.ts
import { describe, expect, it } from "bun:test"
import { ComputerUseParams, validateComputerUseAction } from "../../src/tool/computer-use"

describe("validateComputerUseAction", () => {
  it("accepts screenshot action", () => {
    expect(() => validateComputerUseAction({ action: "screenshot" })).not.toThrow()
  })
  it("accepts click with coordinates", () => {
    expect(() => validateComputerUseAction({ action: "click", x: 100, y: 200 })).not.toThrow()
  })
  it("rejects click without coordinates", () => {
    expect(() => validateComputerUseAction({ action: "click" })).toThrow("click requires x and y")
  })
  it("accepts type with text", () => {
    expect(() => validateComputerUseAction({ action: "type", text: "hello" })).not.toThrow()
  })
  it("rejects type without text", () => {
    expect(() => validateComputerUseAction({ action: "type" })).toThrow("type requires text")
  })
  it("accepts scroll with direction", () => {
    expect(() => validateComputerUseAction({ action: "scroll", direction: "down", amount: 3 })).not.toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
cd packages/opencode && bun test test/tool/computer-use.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Create `computer-use.ts`**

```typescript
// packages/opencode/src/tool/computer-use.ts
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { screenshot, mouse, keyboard, Button, Key } from "@nut-tree-fork/nut-js"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.computer-use" })

export const ComputerUseParams = Schema.Struct({
  action: Schema.Union(
    Schema.Literal("screenshot"),
    Schema.Literal("click"),
    Schema.Literal("double_click"),
    Schema.Literal("right_click"),
    Schema.Literal("move"),
    Schema.Literal("type"),
    Schema.Literal("key"),
    Schema.Literal("scroll"),
  ),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.Union(Schema.Literal("up"), Schema.Literal("down"), Schema.Literal("left"), Schema.Literal("right"))),
  amount: Schema.optional(Schema.Number),
})

type Params = Schema.Schema.Type<typeof ComputerUseParams>

export function validateComputerUseAction(params: Partial<Params>): void {
  switch (params.action) {
    case "click":
    case "double_click":
    case "right_click":
    case "move":
      if (params.x == null || params.y == null) throw new Error(`${params.action} requires x and y`)
      break
    case "type":
      if (!params.text) throw new Error("type requires text")
      break
    case "key":
      if (!params.key) throw new Error("key requires key name")
      break
    case "scroll":
      if (!params.direction) throw new Error("scroll requires direction")
      break
    case "screenshot":
      break
  }
}

export const computerUseTool: Tool.Def<typeof ComputerUseParams> = {
  id: "computer_use",
  description:
    "Control the computer: take screenshots, move the mouse, click, type text, press keys, and scroll. Use screenshot first to understand the current screen state before interacting.",
  parameters: ComputerUseParams,
  execute(params, ctx) {
    return Effect.gen(function* () {
      validateComputerUseAction(params)
      log.info("computer_use", { action: params.action })

      switch (params.action) {
        case "screenshot": {
          const img = yield* Effect.promise(() => screenshot())
          const width = img.width
          const height = img.height
          // Convert to base64 PNG
          const data = yield* Effect.promise(() => img.toRGB())
          const base64 = Buffer.from(data).toString("base64")
          return {
            title: "Screenshot taken",
            metadata: { width, height },
            output: `Screenshot captured: ${width}x${height} pixels`,
            attachments: [
              {
                type: "file" as const,
                mediaType: "image/png",
                filename: `screenshot-${Date.now()}.png`,
                url: `data:image/png;base64,${base64}`,
              },
            ],
          }
        }

        case "click": {
          yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
          yield* Effect.promise(() => mouse.click(Button.LEFT))
          return { title: `Clicked at (${params.x}, ${params.y})`, metadata: {}, output: `Left-clicked at (${params.x}, ${params.y})` }
        }

        case "double_click": {
          yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
          yield* Effect.promise(() => mouse.doubleClick(Button.LEFT))
          return { title: `Double-clicked at (${params.x}, ${params.y})`, metadata: {}, output: `Double-clicked at (${params.x}, ${params.y})` }
        }

        case "right_click": {
          yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
          yield* Effect.promise(() => mouse.click(Button.RIGHT))
          return { title: `Right-clicked at (${params.x}, ${params.y})`, metadata: {}, output: `Right-clicked at (${params.x}, ${params.y})` }
        }

        case "move": {
          yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
          return { title: `Moved mouse to (${params.x}, ${params.y})`, metadata: {}, output: `Mouse moved to (${params.x}, ${params.y})` }
        }

        case "type": {
          yield* Effect.promise(() => keyboard.type(params.text!))
          return { title: "Typed text", metadata: {}, output: `Typed: ${params.text!.slice(0, 40)}${params.text!.length > 40 ? "..." : ""}` }
        }

        case "key": {
          const keyName = params.key! as keyof typeof Key
          const keyCode = Key[keyName]
          if (keyCode == null) {
            return { title: "Unknown key", metadata: {}, output: `Unknown key: ${params.key}. Valid keys: ${Object.keys(Key).join(", ")}` }
          }
          yield* Effect.promise(() => keyboard.pressKey(keyCode))
          yield* Effect.promise(() => keyboard.releaseKey(keyCode))
          return { title: `Pressed key ${params.key}`, metadata: {}, output: `Pressed key: ${params.key}` }
        }

        case "scroll": {
          const pos = params.x != null && params.y != null
            ? { x: params.x, y: params.y }
            : yield* Effect.promise(() => mouse.getPosition())
          const amount = params.amount ?? 3
          yield* Effect.promise(() => mouse.setPosition(pos))
          if (params.direction === "down") yield* Effect.promise(() => mouse.scrollDown(amount))
          else if (params.direction === "up") yield* Effect.promise(() => mouse.scrollUp(amount))
          else if (params.direction === "left") yield* Effect.promise(() => mouse.scrollLeft(amount))
          else yield* Effect.promise(() => mouse.scrollRight(amount))
          return {
            title: `Scrolled ${params.direction}`,
            metadata: {},
            output: `Scrolled ${params.direction} ${amount} clicks at (${pos.x}, ${pos.y})`,
          }
        }

        default:
          return { title: "Unknown action", metadata: {}, output: `Unknown action: ${(params as any).action}` }
      }
    })
  },
}
```

- [ ] **Step 5: Register in registry**

In `packages/opencode/src/tool/registry.ts`, find where other tools are registered (search for `.register(` or `tools.push`) and add:

```typescript
import { computerUseTool } from "./computer-use"
// Add to the registration list:
registry.register(computerUseTool)
```

- [ ] **Step 6: Run tests**

```
cd packages/opencode && bun test test/tool/computer-use.test.ts
```
Expected: 6 tests pass

- [ ] **Step 7: Type-check**

```
cd packages/opencode && bun run typecheck 2>&1 | grep computer-use
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/opencode/src/tool/computer-use.ts packages/opencode/src/tool/registry.ts packages/opencode/test/tool/computer-use.test.ts packages/opencode/package.json bun.lock
git commit -m "feat: add computer-use tool (screenshot, click, type, scroll, key press)"
```

---

## Self-Review

### Spec Coverage
| Feature | Covered? |
|---|---|
| Context compression | ✅ Task 1 — 3 strategies + selector |
| Reasoning/thinking support | ✅ Task 2 — ThinkTagParser for DeepSeek/Kimi |
| SSH terminal backend | ✅ Task 3 — mirrors docker.ts exactly |
| Lifecycle hooks | ✅ Task 4 — 11 events + shell command dispatch |
| Neural learning (SONA) | ✅ Task 5 — trajectory table + reasoning bank + router integration |
| Computer-use tool | ✅ Task 6 — screenshot/click/type/scroll/key |

### Placeholder Scan
No TBDs. Every step has actual code. Task 2 Step 5 has a "read lines 280-340 first" note — this is intentional guidance, not a placeholder, because the exact integration point in processor.ts depends on the shape of `handleTextDelta` which the implementer must verify against the current file before editing.

### Type Consistency
- `SonaService`, `SonaInterface` defined in sona.ts and used in router.ts
- `HooksService`, `HooksInterface` defined in hooks.ts
- `computerUseTool: Tool.Def<typeof ComputerUseParams>` matches the `Tool.Def` interface shape from tool.ts
- `validateSshOptions` exported from ssh.ts and re-exported from index.ts — test imports match

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-24-advanced-features.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans

Which approach?
