# Agent Capability: Subagent Delegation + Cron Scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance OpenLoom's existing subagent work with Hermes-style delegation controls and add a cron scheduler for always-on background jobs.

**Architecture:** Reuse the existing `task` / `task_status` implementation in `packages/opencode/src/tool/task.ts` for child sessions, background mode, parent-result injection, permission derivation, and status. `delegate_task` may be added as a compatibility alias or thin adapter, but it must not create a second child-agent runner. `CronService` runs an instance-scoped tick loop, querying `CronJobTable` for due jobs and spawning child sessions through the same task/subagent infrastructure. Cron sessions link back to the originating job via the `cron_job_id` column on `SessionTable`.

**Tech Stack:** Effect, Drizzle ORM, SQLite, croner, TypeScript, Bun

**Depends on:** Plan 1 (Foundation) — requires `CronJobTable` created in `src/cron/cron.sql.ts` and `cron_job_id` column added to `SessionTable`.

---

## Implementation Corrections

These corrections supersede stale snippets below:

- OpenLoom already has `task` and `task_status`. Extend `TaskTool` or wrap it; do not implement an independent `DelegateTaskTool` runner.
- `SessionPrompt.Service` does not expose the `submit` API used in older examples here. Use the existing task/background/session prompt operations path from `packages/opencode/src/tool/task.ts`.
- `cron_jobs` is the canonical table name from Plan 1. Do not create a singular `cron_job` table.
- Do not add a separate `cron_job_id` data migration in this plan when Plan 1 already owns that column.
- Default child restrictions should be broader than recursion prevention: block delegate recursion where needed, cron mutation tools, memory mutation tools, direct messaging tools, and arbitrary code execution unless the parent permission policy explicitly allows them.
- Copy Hermes delegation features that fit OpenLoom: batch `tasks`, max concurrency, child timeout, max spawn depth, role gating (`orchestrator` vs `leaf`), active subagent pause/interrupt, safe approval callbacks, and parent-visible summary-only results.
- Cron must copy Hermes operational safety: one-shot/interval/cron schedule parser, per-job lock, timeout/interrupt, output archival, `context_from` chaining if adopted, delivery/status fields, pre-run script gate if adopted, and memory writes disabled by default.
- Scheduler startup must be instance-scoped. Avoid a process-global `AppLayer` cron loop that lacks the correct project, permissions, provider config, and lifecycle.

## Plan 1 Foundation Prerequisites (what must already exist before this plan runs)

Before starting Task 1, verify these items exist. If they don't, create them as part of Task 1.

### `src/cron/cron.sql.ts` must define `CronJobTable`:

```typescript
// packages/opencode/src/cron/cron.sql.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { ProjectID } from "../project/schema"

export const CronJobTable = sqliteTable(
  "cron_jobs",
  {
    id: text().primaryKey(),
    project_id: text().$type<ProjectID>().notNull().references(() => ProjectTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    schedule: text().notNull(),
    goal: text().notNull(),
    agent: text().notNull().default("build"),
    toolset_blocklist: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    auto_approve: integer().notNull().default(0),
    enabled: integer().notNull().default(1),
    last_run: integer(),
    next_run: integer(),
    last_session_id: text(),
  },
  (table) => [
    index("cron_jobs_project_idx").on(table.project_id),
    index("cron_jobs_next_run_idx").on(table.next_run),
  ],
)
```

### `SessionTable` must have a `cron_job_id` column:

In `packages/opencode/src/session/session.sql.ts`, the `SessionTable` definition must include:

```typescript
cron_job_id: text(),  // nullable — set when this session was spawned by a cron job
```

Plan 1 owns the Drizzle schema and migration for this column. If it is missing, finish Plan 1 before continuing.

---

## Task 1 — Add `croner` dependency and verify `CronJobTable` prerequisites

**Status:** `- [ ]`

**What:** Add the `croner` npm package to `packages/opencode/package.json` and confirm the Plan 1 foundation files exist (creating them if absent).

### Step 1.1 — Add `croner` to package.json

In `packages/opencode/package.json`, add to the `"dependencies"` object (keep alphabetical order with other `c` packages):

```json
"croner": "^9.0.0",
```

After editing, run from the repo root:

```bash
bun install
```

### Step 1.2 — Verify or create `src/cron/cron.sql.ts`

Check whether `packages/opencode/src/cron/cron.sql.ts` exists. If it does not:

```bash
mkdir -p packages/opencode/src/cron
```

Then create `packages/opencode/src/cron/cron.sql.ts` with the content shown in the Prerequisites section above.

### Step 1.3 — Verify `cron_job_id` from Plan 1

Open `packages/opencode/src/session/session.sql.ts`. After the `agent: text(),` line, ensure the following column exists:

```typescript
cron_job_id: text(),
```

If it is missing, stop and complete Plan 1 first. This plan must not add a second migration for the same column.

### Step 1.4 — Smoke-test `croner` import

Create a temporary verification file `packages/opencode/src/cron/_verify-croner.ts`:

```typescript
import { Cron } from "croner"

const job = new Cron("0 9 * * *")
const next = job.nextRun()
console.log("croner works, next run:", next?.toISOString())
```

Run:

```bash
bun packages/opencode/src/cron/_verify-croner.ts
```

It should print a date. Delete the file afterward.

---

## Task 2 — Enhance existing `TaskTool` and optionally add `delegate_task` alias

**Status:** `- [ ]`

**What:** Extend `packages/opencode/src/tool/task.ts` instead of creating a separate runner. Add any missing Hermes-inspired controls there, then optionally register `delegate_task` as a compatibility alias that forwards to the same implementation.

**Files:** `packages/opencode/src/tool/task.ts`, `packages/opencode/src/tool/registry.ts`, optional `packages/opencode/src/subagent/delegate.ts` adapter.

### Key design decisions

1. Preserve existing `TaskTool` behavior for child sessions, background jobs, parent-session result injection, permission derivation, and `task_status`.
2. Add batch delegation by accepting a `tasks` array of self-contained goals and running independent children with a configurable concurrency cap.
3. Add timeout and max spawn depth controls so subagents cannot recursively fan out without bounds.
4. Add role gating: `orchestrator` may delegate; `leaf` cannot use delegation, cron mutation, memory mutation, direct messaging, or arbitrary code execution unless explicitly allowed.
5. Preserve the current experimental background-subagent gate for background/status behavior.
6. If `delegate_task` is registered, make it an alias over the same implementation and schema conversion, not a fork.

**Create `packages/opencode/src/subagent/delegate.ts`:**

```typescript
import { Effect, Schema, Schedule } from "effect"
import * as Tool from "@/tool/tool"
import { InstanceState } from "@/effect/instance-state"
import { Database, eq } from "@/storage/db"
import { SessionTable } from "@/session/session.sql"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { BackgroundJob } from "@/background/job"
import { Identifier } from "@/id/id"
import * as Log from "@openloom/core/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { SessionPrompt } from "@/session/prompt"

const log = Log.create({ service: "tool.delegate_task" })

/** Tools always blocked for child sessions to prevent loops. */
const DEFAULT_BLOCKLIST = ["delegate_task", "cron_create", "cron_delete"]

const Parameters = Schema.Struct({
  goal: Schema.String.annotate({
    description:
      "The complete, self-contained task description for the subagent. Include all context it needs — it cannot ask the parent for clarification.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent mode to use for the subagent. Options: build, plan, general. Default: build.",
  }),
  await: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true (default), block until the subagent completes and return its result. When false, fire-and-forget — return immediately with the child session ID.",
  }),
  toolset_blocklist: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Additional tool IDs to deny the subagent. The tools delegate_task, cron_create, and cron_delete are always blocked regardless of this field.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

/**
 * Run a goal in a child session.
 *
 * Uses SessionPrompt.Service to submit the goal as the first user message,
 * then waits for the session to reach idle state (status transitions from
 * busy → idle), polling BackgroundJob for the job created by SessionPrompt.
 *
 * Returns the last assistant message text (for await mode).
 */
const runGoalInSession = Effect.fn("DelegateTask.runGoalInSession")(function* (
  childSessionID: SessionID,
  goal: string,
  toolsetBlocklist: string[],
) {
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service

  // Submit the goal as the first user message
  yield* prompt.submit({
    sessionID: childSessionID,
    content: goal,
    toolsetBlocklist,
  })

  // Retrieve the last assistant message from the completed session
  const messages = yield* sessions.messages({ sessionID: childSessionID })
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.info.role === "assistant")

  const resultText = lastAssistant
    ? lastAssistant.parts
        .filter((p) => p.type === "text")
        .map((p: any) => p.text as string)
        .join("\n")
    : ""

  return resultText
})

export const DelegateTaskTool = Tool.define(
  "delegate_task",
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service

    const run = Effect.fn("DelegateTaskTool.execute")(function* (
      params: Params,
      ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context
      const sessions = yield* Session.Service

      const agentMode = params.agent ?? "build"
      const shouldAwait = params.await ?? true

      // Merge caller's blocklist with the always-blocked defaults
      const mergedBlocklist = [
        ...DEFAULT_BLOCKLIST,
        ...(params.toolset_blocklist ?? []),
      ]

      // 1. Create the child session
      const childTitle = `Delegated: ${params.goal.slice(0, 60)}${params.goal.length > 60 ? "…" : ""}`
      const child = yield* sessions.create({
        title: childTitle,
        agent: agentMode,
        parentID: ctx.sessionID,
      })

      log.info("DelegateTaskTool: child session created", {
        childSessionID: child.id,
        parentSessionID: ctx.sessionID,
        agent: agentMode,
        await: shouldAwait,
      })

      // 2a. Fire-and-forget mode: start a background job and return immediately
      if (!shouldAwait) {
        const jobID = Identifier.ascending("delegate")
        yield* background.start({
          id: jobID,
          type: "delegate_task",
          title: childTitle,
          metadata: { sessionId: child.id, parentSessionId: ctx.sessionID },
          run: runGoalInSession(child.id, params.goal, mergedBlocklist).pipe(
            Effect.asVoid,
            Effect.map(() => `Delegated task completed: ${child.id}`),
          ),
        })

        return {
          title: "Delegated task (fire-and-forget)",
          metadata: {
            mode: "fire_and_forget" as const,
            child_session_id: child.id,
            job_id: jobID,
          },
          output: JSON.stringify(
            {
              success: true,
              mode: "fire_and_forget",
              child_session_id: child.id,
              job_id: jobID,
              message: "Subagent started. Use session_search or the child_session_id to check progress.",
            },
            null,
            2,
          ),
        }
      }

      // 2b. Await mode: run in a BackgroundJob, then wait for it to finish
      const jobID = Identifier.ascending("delegate")
      let resultText = ""

      const job = yield* background.start({
        id: jobID,
        type: "delegate_task",
        title: childTitle,
        metadata: { sessionId: child.id, parentSessionId: ctx.sessionID },
        run: Effect.gen(function* () {
          const text = yield* runGoalInSession(child.id, params.goal, mergedBlocklist)
          resultText = text
          return text
        }),
      })

      // Block until the job finishes (no timeout — the parent session's own
      // abort signal will interrupt the whole Effect tree if the user cancels)
      const waitResult = yield* background.wait({ id: job.id })

      const finalResult = waitResult.info?.output ?? resultText

      return {
        title: "Delegated task result",
        metadata: {
          mode: "await" as const,
          child_session_id: child.id,
          job_id: jobID,
          result_length: finalResult.length,
        },
        output: JSON.stringify(
          {
            success: true,
            mode: "await",
            child_session_id: child.id,
            result: finalResult,
          },
          null,
          2,
        ),
      }
    })

    return {
      description: [
        "Delegate a task to a new child session (subagent).",
        "",
        "Creates a child session with the specified agent mode, submits the goal as the first user message,",
        "and either waits for the result (await: true, default) or returns immediately with the session ID (await: false).",
        "",
        "Use this tool to parallelise independent tasks, run long-running work in the background,",
        "or specialise work to a different agent mode without cluttering the current session.",
        "",
        "The child session inherits the current project directory. Its output is recorded in session history",
        "and can be retrieved with session_search.",
        "",
        "The tools delegate_task, cron_create, and cron_delete are always blocked for child sessions",
        "to prevent infinite delegation loops.",
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
```

### Step 2.1 — Create the directory

```bash
mkdir -p packages/opencode/src/subagent
```

Only create this directory if you are adding a small compatibility adapter. Prefer editing `packages/opencode/src/tool/task.ts`.

### Step 2.2 — Create the file

Write `packages/opencode/src/subagent/delegate.ts` only if it forwards to the existing task implementation. Do not copy the older standalone runner above.

### Step 2.3 — Obsolete fallback: do not use `SessionPrompt.Service.submit`

The older text below assumed a `submit` method on `SessionPrompt.Service`. Current OpenLoom does not expose that API. Use the existing `TaskTool` prompt operations/background path instead.

Run:

```bash
Select-String -Path packages/opencode/src/session/prompt.ts -Pattern "Interface|readonly|prompt|loop|cancel" | Select-Object -First 30
```

Do not add a synthetic bus runner unless the existing `TaskTool` path cannot be adapted. If a bus path becomes necessary, document why the established task path could not be reused before implementing it.

```typescript
// Emit a run event that the existing SessionRunState pipeline picks up
yield* Bus.publish(BusEvent.define("session.run.request", Schema.Struct({
  sessionID: SessionID,
  content: Schema.String,
  toolsetBlocklist: Schema.Array(Schema.String),
}))({ sessionID: childSessionID, content: goal, toolsetBlocklist }))

// Poll until the session status transitions back to idle
// (SessionStatus stores per-session busy/idle in an InstanceState-backed ref)
yield* Effect.repeat(
  Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service.list()
    const running = jobs.filter(j => j.metadata?.sessionId === childSessionID && j.status === "running")
    if (running.length > 0) yield* Effect.fail("still running")
  }).pipe(Effect.ignore),
  Schedule.recurWhile(() => false), // placeholder — see note
)
```

**Preferred approach:** Check `packages/opencode/src/tool/task.ts` first. The existing task implementation already handles child sessions, background execution, permission derivation, and parent-result delivery.

---

## Task 3 — Write `test/subagent/delegate.test.ts`

**Status:** `- [ ]`

**What:** Tests for the enhanced `TaskTool` behavior and optional `delegate_task` adapter. Test that the existing child-session path still creates sessions with the correct `parent_id`, applies the default blocklist, supports fire-and-forget/background status, and handles batch delegation with concurrency limits.

**File:** `packages/opencode/test/subagent/delegate.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@/storage/db"
import { SessionTable } from "@/session/session.sql"
import { eq } from "drizzle-orm"

// ── helpers ─────────────────────────────────────────────────────────────────
// These tests rely on the full AppLayer being available (integration-style).
// They use the test bootstrap pattern established in test/session/prompt.test.ts.

import { testLayer } from "../helpers/test-layer"  // adjust path if different

describe("DelegateTaskTool", () => {
  // ── Test 1: child session created with correct parent_id ─────────────────
  test("await mode creates child session with parent_id set", async () => {
    await Effect.gen(function* () {
      // Create a parent session first
      const { Session } = yield* import("@/session/session")
      const sessions = yield* Session.Service
      const parent = yield* sessions.create({ title: "Parent", agent: "build" })

      // Import and execute the tool
      const { DelegateTaskTool } = yield* import("@/subagent/delegate")
      const toolDef = yield* DelegateTaskTool.init()

      // Build a minimal tool context
      const fakeCtx: any = {
        sessionID: parent.id,
        messageID: "msg_test_01" as any,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      // Execute with a simple goal (fire-and-forget to avoid needing a running LLM)
      const result = yield* toolDef.execute(
        { goal: "List the files in the current directory", await: false },
        fakeCtx,
      )

      const parsed = JSON.parse(result.output)
      expect(parsed.success).toBe(true)
      expect(parsed.mode).toBe("fire_and_forget")
      expect(typeof parsed.child_session_id).toBe("string")

      // Verify the child session row has parent_id set
      const childRow = Database.use((db) =>
        db.select().from(SessionTable).where(eq(SessionTable.id, parsed.child_session_id)).get()
      )
      expect(childRow).toBeDefined()
      expect(childRow?.parent_id).toBe(parent.id)
    }).pipe(Effect.provide(testLayer), Effect.runPromise)
  })

  // ── Test 2: default blocklist is applied ─────────────────────────────────
  test("default blocklist always includes delegate_task, cron_create, cron_delete", async () => {
    // This is a pure unit test on the DEFAULT_BLOCKLIST constant
    // Access via the module's exported constant (add an export in delegate.ts if needed)
    const mod = await import("@/subagent/delegate")
    // The DEFAULT_BLOCKLIST is referenced inside the tool; verify it via the
    // metadata returned by fire-and-forget execution (see the output shape)
    // Alternatively check the tool description mentions these blocked tools.
    const toolDef = await Effect.runPromise(
      Effect.gen(function* () { return yield* mod.DelegateTaskTool.init() }).pipe(
        Effect.provide(testLayer),
      )
    )
    expect(toolDef.description).toContain("delegate_task")
    expect(toolDef.description).toContain("cron_create")
    expect(toolDef.description).toContain("cron_delete")
  })

  // ── Test 3: fire-and-forget returns immediately ───────────────────────────
  test("fire-and-forget returns a job_id without awaiting completion", async () => {
    await Effect.gen(function* () {
      const { Session } = yield* import("@/session/session")
      const sessions = yield* Session.Service
      const parent = yield* sessions.create({ title: "Parent FFT", agent: "build" })

      const { DelegateTaskTool } = yield* import("@/subagent/delegate")
      const toolDef = yield* DelegateTaskTool.init()

      const fakeCtx: any = {
        sessionID: parent.id,
        messageID: "msg_test_ff" as any,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const start = Date.now()
      const result = yield* toolDef.execute(
        { goal: "Sleep for 10 seconds", await: false },
        fakeCtx,
      )
      const elapsed = Date.now() - start

      // Fire-and-forget must return in well under 1 second
      expect(elapsed).toBeLessThan(1000)

      const parsed = JSON.parse(result.output)
      expect(parsed.mode).toBe("fire_and_forget")
      expect(typeof parsed.job_id).toBe("string")
    }).pipe(Effect.provide(testLayer), Effect.runPromise)
  })
})
```

**Run tests:**

```bash
bun test packages/opencode/test/subagent/ --timeout 30000
```

---

## Task 4 — Create `src/cron/cron.ts` with `CronService`

**Status:** `- [ ]`

**What:** Implement the `CronService` Effect Layer providing `create`, `list`, `delete`, `tick`, `start`, and `stop` methods.

**File:** `packages/opencode/src/cron/cron.ts`

Before implementing the older sketch below, fold in these required scheduler behaviors:

- Parse 5-field cron, 6-field cron, `every 30m`-style intervals, and one-shot ISO/duration schedules if adopted from Hermes.
- Acquire a per-job lock before spawning a child session and clear it on completion, timeout, or interrupt.
- Write `running_session_id`, `last_session_id`, `last_run`, `next_run`, `last_error`, and `run_count` consistently.
- Spawn via the existing task/subagent infrastructure, not by calling a nonexistent prompt submit method.
- Disable memory writes from cron child sessions by default, with an explicit opt-in flag later if needed.
- Store or expose run output separately from delivery errors so failed notification does not look like failed job execution.
- Start the scheduler from an instance-scoped lifecycle hook, not from a process-global layer.

```typescript
import { Context, Effect, Layer, Schedule } from "effect"
import { Database, eq, and, lte } from "@/storage/db"
import { CronJobTable } from "./cron.sql"
import { SessionTable } from "@/session/session.sql"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { BackgroundJob } from "@/background/job"
import { InstanceState } from "@/effect/instance-state"
import { Identifier } from "@/id/id"
import { Cron } from "croner"
import * as Log from "@openloom/core/util/log"
import type { ProjectID } from "@/project/schema"

const log = Log.create({ service: "cron" })

// ── Types ────────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string
  projectID: string
  name: string
  schedule: string
  goal: string
  agent: string
  toolsetBlocklist: string[]
  autoApprove: boolean
  enabled: boolean
  lastRun: number | undefined
  nextRun: number | undefined
  lastSessionId: string | undefined
}

type CreateInput = {
  projectID: string
  name: string
  schedule: string
  goal: string
  agent?: string
  toolsetBlocklist?: string[]
  autoApprove?: boolean
}

export interface Interface {
  /** Start the background scheduler loop (60-second tick). */
  readonly start: () => Effect.Effect<void>
  /** Stop the scheduler loop. */
  readonly stop: () => Effect.Effect<void>
  /** Create a new cron job for the given project. */
  readonly create: (input: CreateInput) => Effect.Effect<CronJob, Error>
  /** List all cron jobs for the given project. */
  readonly list: (projectID: string) => Effect.Effect<CronJob[]>
  /** Delete a cron job by ID. */
  readonly delete: (id: string) => Effect.Effect<void>
  /**
   * Check for due jobs and spawn child sessions for each.
   * Called automatically every 60 seconds by start().
   * Exposed here so it can be called in tests.
   */
  readonly tick: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/CronService") {}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the next run timestamp (ms since epoch) for a cron schedule string.
 * Returns undefined if the schedule is invalid or has no future occurrence.
 */
function computeNextRun(schedule: string): number | undefined {
  try {
    const job = new Cron(schedule)
    const next = job.nextRun()
    return next?.getTime()
  } catch {
    return undefined
  }
}

/**
 * Validate that a schedule string is parseable by croner.
 * Returns the error message if invalid, undefined if valid.
 */
function validateSchedule(schedule: string): string | undefined {
  try {
    new Cron(schedule)
    return undefined
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function rowToJob(row: typeof CronJobTable.$inferSelect): CronJob {
  return {
    id: row.id,
    projectID: row.project_id,
    name: row.name,
    schedule: row.schedule,
    goal: row.goal,
    agent: row.agent,
    toolsetBlocklist: (row.toolset_blocklist as string[]) ?? [],
    autoApprove: row.auto_approve === 1,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    lastSessionId: row.last_session_id ?? undefined,
  }
}

// ── Layer ────────────────────────────────────────────────────────────────────

export const layer: Layer.Layer<
  Service,
  never,
  Session.Service | SessionPrompt.Service | BackgroundJob.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service

    // ── tick ────────────────────────────────────────────────────────────────
    const tick: Interface["tick"] = Effect.fn("CronService.tick")(function* () {
      const now = Date.now()
      const instance = yield* InstanceState.context

      const dueJobs = Database.use((db) =>
        db
          .select()
          .from(CronJobTable)
          .where(
            and(
              eq(CronJobTable.project_id, instance.project.id),
              eq(CronJobTable.enabled, 1),
              lte(CronJobTable.next_run, now),
            ),
          )
          .all(),
      )

      if (dueJobs.length === 0) return

      log.info("CronService.tick: running due jobs", { count: dueJobs.length })

      yield* Effect.forEach(
        dueJobs,
        Effect.fnUntraced(function* (job) {
          const jobID = `cron-job-${job.id}-${now}`

          yield* background.start({
            id: jobID,
            type: "cron_job",
            title: `Cron: ${job.name}`,
            metadata: { cronJobId: job.id, projectId: job.project_id },
            run: Effect.gen(function* () {
              // Create a child session for this cron job execution
              const child = yield* sessions.create({
                title: `Cron: ${job.name}`,
                agent: job.agent,
              })

              // Link the session back to the cron job
              Database.use((db) =>
                db
                  .update(SessionTable)
                  .set({ cron_job_id: job.id })
                  .where(eq(SessionTable.id, child.id))
                  .run(),
              )

              log.info("CronService: spawned session for cron job", {
                cronJobId: job.id,
                sessionId: child.id,
              })

              // Run the goal in the child session
              yield* prompt.submit({
                sessionID: child.id,
                content: job.goal,
                toolsetBlocklist: ["delegate_task", "cron_create", "cron_delete"],
              })

              // Update job metadata
              const nextRun = computeNextRun(job.schedule)
              Database.use((db) =>
                db
                  .update(CronJobTable)
                  .set({
                    last_run: now,
                    last_session_id: child.id,
                    next_run: nextRun ?? null,
                  })
                  .where(eq(CronJobTable.id, job.id))
                  .run(),
              )

              return `Cron job ${job.name} completed, session: ${child.id}`
            }),
          })
        }),
        { concurrency: "unbounded", discard: true },
      )
    })

    // ── start ────────────────────────────────────────────────────────────────
    const start: Interface["start"] = Effect.fn("CronService.start")(function* () {
      yield* background.start({
        id: "cron-scheduler",
        type: "cron_scheduler",
        title: "Cron scheduler (60s tick)",
        run: Effect.repeat(
          tick().pipe(
            Effect.catchAll((err) =>
              Effect.sync(() => log.error("CronService.tick error", { error: String(err) })),
            ),
          ),
          Schedule.spaced("60 seconds"),
        ).pipe(Effect.map(() => "scheduler stopped")),
      })

      log.info("CronService: scheduler started")
    })

    // ── stop ─────────────────────────────────────────────────────────────────
    const stop: Interface["stop"] = Effect.fn("CronService.stop")(function* () {
      yield* background.cancel("cron-scheduler").pipe(Effect.ignore)
      log.info("CronService: scheduler stopped")
    })

    // ── create ───────────────────────────────────────────────────────────────
    const create: Interface["create"] = Effect.fn("CronService.create")(function* (input) {
      const validationError = validateSchedule(input.schedule)
      if (validationError) {
        return yield* Effect.fail(
          new Error(`Invalid cron schedule "${input.schedule}": ${validationError}`),
        )
      }

      const id = Identifier.ascending("cron")
      const nextRun = computeNextRun(input.schedule)

      Database.use((db) =>
        db
          .insert(CronJobTable)
          .values({
            id,
            project_id: input.projectID as ProjectID,
            name: input.name,
            schedule: input.schedule,
            goal: input.goal,
            agent: input.agent ?? "build",
            toolset_blocklist: input.toolsetBlocklist ?? [],
            auto_approve: input.autoApprove ? 1 : 0,
            enabled: 1,
            next_run: nextRun ?? null,
          })
          .run(),
      )

      log.info("CronService.create: job created", { id, name: input.name, schedule: input.schedule })

      const row = Database.use((db) =>
        db.select().from(CronJobTable).where(eq(CronJobTable.id, id)).get(),
      )!

      return rowToJob(row)
    })

    // ── list ─────────────────────────────────────────────────────────────────
    const list: Interface["list"] = Effect.fn("CronService.list")(function* (projectID) {
      const rows = Database.use((db) =>
        db
          .select()
          .from(CronJobTable)
          .where(eq(CronJobTable.project_id, projectID as ProjectID))
          .all(),
      )
      return rows.map(rowToJob)
    })

    // ── delete ───────────────────────────────────────────────────────────────
    const delete_: Interface["delete"] = Effect.fn("CronService.delete")(function* (id) {
      Database.use((db) =>
        db.delete(CronJobTable).where(eq(CronJobTable.id, id)).run(),
      )
      log.info("CronService.delete: job deleted", { id })
    })

    return Service.of({ start, stop, create, list, delete: delete_, tick })
  }),
)

export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide(Session.defaultLayer),
  // SessionPrompt.defaultLayer and BackgroundJob.defaultLayer are part of the
  // full AppLayer — provide them here only in test contexts.
  // In production, CronService.layer is added to AppLayer and gets them from there.
)

export * as CronService from "./cron"
```

### Step 4.1 — Create the directory (already done in Task 2 Step 1):

```bash
ls packages/opencode/src/cron/
```

Should show `cron.sql.ts`. Now create `cron.ts` in the same directory.

### Step 4.2 — Check `SessionPrompt.Service` interface

```bash
Select-String -Path packages/opencode/src/session/prompt.ts -Pattern "Interface|readonly|prompt|loop|cancel" | Select-Object -First 30
```

If the method is named differently (e.g. `run`, `send`, `process`), update the `prompt.submit(...)` calls in `cron.ts` and `delegate.ts` accordingly.

---

## Task 5 — Write `test/cron/cron.test.ts`

**Status:** `- [ ]`

**What:** Unit tests for `CronService`. Test CRUD operations, `computeNextRun` with common expressions, and that `tick()` fires a `BackgroundJob` for a due job.

**File:** `packages/opencode/test/cron/cron.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@/storage/db"
import { CronJobTable } from "@/cron/cron.sql"
import { CronService } from "@/cron/cron"
import { BackgroundJob } from "@/background/job"

import { testLayer } from "../helpers/test-layer"

const cronLayer = Layer.mergeAll(testLayer, CronService.layer)

describe("CronService — CRUD", () => {
  test("create() inserts a job and returns it with a computed next_run", async () => {
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service

      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "Daily 9am",
        schedule: "0 9 * * *",
        goal: "Run daily build report",
      })

      expect(job.id).toBeTruthy()
      expect(job.name).toBe("Daily 9am")
      expect(job.schedule).toBe("0 9 * * *")
      expect(job.nextRun).toBeDefined()
      expect(job.nextRun).toBeGreaterThan(Date.now())
      expect(job.enabled).toBe(true)
      expect(job.agent).toBe("build")
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })

  test("create() fails for an invalid schedule", async () => {
    const result = await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service

      return yield* cron.create({
        projectID: instance.project.id,
        name: "Bad",
        schedule: "not-a-cron",
        goal: "Should fail",
      }).pipe(Effect.either)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Invalid cron schedule")
    }
  })

  test("list() returns jobs for the current project", async () => {
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service

      yield* cron.create({ projectID: instance.project.id, name: "Job A", schedule: "*/5 * * * *", goal: "A" })
      yield* cron.create({ projectID: instance.project.id, name: "Job B", schedule: "0 * * * *", goal: "B" })

      const jobs = yield* cron.list(instance.project.id)
      expect(jobs.length).toBeGreaterThanOrEqual(2)
      expect(jobs.some((j) => j.name === "Job A")).toBe(true)
      expect(jobs.some((j) => j.name === "Job B")).toBe(true)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })

  test("delete() removes the job", async () => {
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service

      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "To Delete",
        schedule: "0 0 * * *",
        goal: "Delete me",
      })

      yield* cron.delete(job.id)

      const jobs = yield* cron.list(instance.project.id)
      expect(jobs.some((j) => j.id === job.id)).toBe(false)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })
})

describe("CronService — computeNextRun", () => {
  // These tests are purely synchronous and do not need the Effect layer.

  test("'0 9 * * *' resolves to a future time", async () => {
    const mod = await import("@/cron/cron")
    // computeNextRun is not exported by default; export it from cron.ts for testing:
    // export { computeNextRun } — add this export
    // Or test it indirectly via CronService.create()
    // For now, verify via create() that next_run is set and is > now
    const now = Date.now()
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service
      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "9am test",
        schedule: "0 9 * * *",
        goal: "test",
      })
      expect(job.nextRun).toBeDefined()
      expect(job.nextRun!).toBeGreaterThan(now)
      // 0 9 * * * must be < 24 hours from now
      expect(job.nextRun!).toBeLessThan(now + 24 * 60 * 60 * 1000 + 1000)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })

  test("'*/5 * * * *' (every 5 minutes) next run is within 5 minutes", async () => {
    const now = Date.now()
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service
      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "5min test",
        schedule: "*/5 * * * *",
        goal: "test",
      })
      expect(job.nextRun!).toBeLessThan(now + 5 * 60 * 1000 + 1000)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })
})

describe("CronService — tick()", () => {
  test("tick() launches a BackgroundJob for a due job", async () => {
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service
      const background = yield* BackgroundJob.Service

      // Create a job that is already due (next_run in the past)
      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "Due Now",
        schedule: "0 0 1 1 *", // once a year — will have a next_run in the future
        goal: "tick test goal",
      })

      // Force next_run to be in the past by directly updating the DB
      Database.use((db) =>
        db
          .update(CronJobTable)
          .set({ next_run: Date.now() - 1000 }) // 1 second ago
          .where(import("drizzle-orm").then((m) => m.eq(CronJobTable.id, job.id)) as any)
          .run(),
      )

      const jobsBefore = yield* background.list()
      const countBefore = jobsBefore.filter((j) => j.type === "cron_job").length

      yield* cron.tick()

      const jobsAfter = yield* background.list()
      const countAfter = jobsAfter.filter((j) => j.type === "cron_job").length

      expect(countAfter).toBeGreaterThan(countBefore)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })

  test("tick() does not launch jobs that are not yet due", async () => {
    await Effect.gen(function* () {
      const instance = yield* import("@/effect/instance-state").then((m) => m.InstanceState.context)
      const cron = yield* CronService.Service
      const background = yield* BackgroundJob.Service

      // Create a job with next_run far in the future
      const job = yield* cron.create({
        projectID: instance.project.id,
        name: "Future Job",
        schedule: "0 0 1 1 *",
        goal: "should not run",
      })

      const jobsBefore = yield* background.list()
      const countBefore = jobsBefore.filter((j) => j.type === "cron_job").length

      yield* cron.tick()

      const jobsAfter = yield* background.list()
      const countAfter = jobsAfter.filter((j) => j.type === "cron_job").length

      expect(countAfter).toBe(countBefore)
    }).pipe(Effect.provide(cronLayer), Effect.runPromise)
  })
})
```

**Run tests:**

```bash
bun test packages/opencode/test/cron/ --timeout 30000
```

---

## Task 6 — Create `src/cron/cron-tools.ts` with `CronCreateTool`, `CronListTool`, `CronDeleteTool`

**Status:** `- [ ]`

**What:** Three tools that expose cron job management to the LLM. They delegate to `CronService` for all persistence and logic.

**File:** `packages/opencode/src/cron/cron-tools.ts`

```typescript
import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { CronService } from "./cron"
import { InstanceState } from "@/effect/instance-state"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.cron" })

// ── cron_create ──────────────────────────────────────────────────────────────

const CronCreateParameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "A short, human-readable name for this cron job (e.g. 'Daily report', 'Hourly health check').",
  }),
  schedule: Schema.String.annotate({
    description: [
      "A standard 5-field cron expression (minute hour day month weekday).",
      "Examples: '0 9 * * *' (every day at 9am), '*/30 * * * *' (every 30 minutes),",
      "'0 0 * * 1' (every Monday at midnight), '0 12 1 * *' (1st of every month at noon).",
    ].join(" "),
  }),
  goal: Schema.String.annotate({
    description: "The task the agent should execute on each tick. Write it as a complete, self-contained instruction — the agent will have no conversation history to draw from.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent mode for the spawned session. Options: build, plan, general. Default: build.",
  }),
  auto_approve: Schema.optional(Schema.Boolean).annotate({
    description: "When true, the spawned sessions run without requiring user permission prompts. Default: false.",
  }),
})

export const CronCreateTool = Tool.define(
  "cron_create",
  Effect.gen(function* () {
    const cron = yield* CronService.Service

    const run = Effect.fn("CronCreateTool.execute")(function* (
      params: Schema.Schema.Type<typeof CronCreateParameters>,
      _ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context

      const job = yield* cron.create({
        projectID: instance.project.id,
        name: params.name,
        schedule: params.schedule,
        goal: params.goal,
        agent: params.agent ?? "build",
        autoApprove: params.auto_approve ?? false,
      })

      log.info("CronCreateTool: job created", { id: job.id, name: job.name })

      const nextRunLabel = job.nextRun
        ? new Date(job.nextRun).toISOString()
        : "unknown"

      return {
        title: `Cron job created: ${job.name}`,
        metadata: {
          mode: "created" as const,
          job_id: job.id,
          next_run: job.nextRun ?? 0,
        },
        output: JSON.stringify(
          {
            success: true,
            job: {
              id: job.id,
              name: job.name,
              schedule: job.schedule,
              goal: job.goal,
              agent: job.agent,
              auto_approve: job.autoApprove,
              enabled: job.enabled,
              next_run: nextRunLabel,
            },
          },
          null,
          2,
        ),
      }
    })

    return {
      description: [
        "Create a new cron job that runs a goal on a recurring schedule.",
        "",
        "The cron job spawns a new agent session on each tick, running the specified goal",
        "as the session's first (and only) user message. Sessions are linked to the job",
        "via cron_job_id and appear in session history like any other session.",
        "",
        "Use this tool when the user wants to automate a recurring task:",
        "  - Scheduled reports ('run a build summary every morning at 9am')",
        "  - Periodic health checks ('check the API is healthy every 5 minutes')",
        "  - Scheduled maintenance ('clean up temp files every Sunday at midnight')",
      ].join("\n"),
      parameters: CronCreateParameters,
      execute: (params: Schema.Schema.Type<typeof CronCreateParameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)

// ── cron_list ────────────────────────────────────────────────────────────────

const CronListParameters = Schema.Struct({})

export const CronListTool = Tool.define(
  "cron_list",
  Effect.gen(function* () {
    const cron = yield* CronService.Service

    const run = Effect.fn("CronListTool.execute")(function* (
      _params: Schema.Schema.Type<typeof CronListParameters>,
      _ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context
      const jobs = yield* cron.list(instance.project.id)

      const formatted = jobs.map((job) => ({
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        goal_preview: job.goal.slice(0, 80) + (job.goal.length > 80 ? "…" : ""),
        agent: job.agent,
        enabled: job.enabled,
        last_run: job.lastRun ? new Date(job.lastRun).toISOString() : null,
        next_run: job.nextRun ? new Date(job.nextRun).toISOString() : null,
        last_session_id: job.lastSessionId ?? null,
      }))

      return {
        title: `Cron jobs (${jobs.length})`,
        metadata: {
          mode: "list" as const,
          count: jobs.length,
        },
        output: JSON.stringify(
          {
            success: true,
            count: jobs.length,
            jobs: formatted,
          },
          null,
          2,
        ),
      }
    })

    return {
      description: [
        "List all cron jobs configured for the current project.",
        "",
        "Returns each job's id, name, schedule, goal preview, agent mode, enabled state,",
        "last run time, next scheduled run time, and the session ID of the last execution.",
        "",
        "Use this to inspect what recurring tasks are scheduled, check their next run times,",
        "or find the session ID of a previous cron execution to review its output.",
      ].join("\n"),
      parameters: CronListParameters,
      execute: (_params: Schema.Schema.Type<typeof CronListParameters>, ctx: Tool.Context) =>
        run(_params, ctx).pipe(Effect.orDie),
    }
  }),
)

// ── cron_delete ──────────────────────────────────────────────────────────────

const CronDeleteParameters = Schema.Struct({
  name_or_id: Schema.String.annotate({
    description: "The name or ID of the cron job to delete. Use cron_list to find names and IDs.",
  }),
})

export const CronDeleteTool = Tool.define(
  "cron_delete",
  Effect.gen(function* () {
    const cron = yield* CronService.Service

    const run = Effect.fn("CronDeleteTool.execute")(function* (
      params: Schema.Schema.Type<typeof CronDeleteParameters>,
      _ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context
      const jobs = yield* cron.list(instance.project.id)

      // Match by ID first, then by name (case-insensitive)
      const match =
        jobs.find((j) => j.id === params.name_or_id) ??
        jobs.find((j) => j.name.toLowerCase() === params.name_or_id.toLowerCase())

      if (!match) {
        return yield* Effect.fail(
          new Error(
            `No cron job found with name or ID "${params.name_or_id}". ` +
            `Use cron_list to see available jobs.`,
          ),
        )
      }

      yield* cron.delete(match.id)

      log.info("CronDeleteTool: job deleted", { id: match.id, name: match.name })

      return {
        title: `Cron job deleted: ${match.name}`,
        metadata: {
          mode: "deleted" as const,
          job_id: match.id,
        },
        output: JSON.stringify(
          {
            success: true,
            deleted: {
              id: match.id,
              name: match.name,
              schedule: match.schedule,
            },
          },
          null,
          2,
        ),
      }
    })

    return {
      description: [
        "Delete a cron job by name or ID.",
        "",
        "Permanently removes the cron job. Any sessions already spawned by this job",
        "are not affected — they remain in session history.",
        "",
        "Use cron_list to find the correct name or ID before deleting.",
      ].join("\n"),
      parameters: CronDeleteParameters,
      execute: (params: Schema.Schema.Type<typeof CronDeleteParameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
```

---

## Task 7 — Wire all 4 new tools into `src/tool/registry.ts`

**Status:** `- [ ]`

**What:** Register cron tools and, only if needed, a `delegate_task` adapter in the `ToolRegistry` layer. The existing `task` and `task_status` tools should remain the primary implementation.

**File:** `packages/opencode/src/tool/registry.ts`

### Step 7.1 — Add imports (after the existing import block, near line 28–31)

```typescript
// Optional compatibility adapter only; prefer the existing task tool implementation.
import { DelegateTaskTool } from "../subagent/delegate"
import { CronCreateTool, CronListTool, CronDeleteTool } from "../cron/cron-tools"
import { CronService } from "../cron/cron"
```

### Step 7.2 — Add `CronService` to the layer requirements

In the `layer` type annotation (around line 83), add `CronService.Service` to the requirements union:

```typescript
export const layer: Layer.Layer<
  Service,
  never,
  | Config.Service
  | Plugin.Service
  | Question.Service
  | Todo.Service
  | Agent.Service
  | Skill.Service
  | Session.Service
  | SessionStatus.Service
  | BackgroundJob.Service
  | Provider.Service
  | Git.Service
  | Reference.Service
  | LSP.Service
  | Instruction.Service
  | AppFileSystem.Service
  | Bus.Service
  | HttpClient.HttpClient
  | ChildProcessSpawner
  | Ripgrep.Service
  | Format.Service
  | Truncate.Service
  | RuntimeFlags.Service
  | CronService.Service          // ADD THIS
```

Do not add `SessionPrompt.Service` here for delegation. The existing task path already owns prompt execution.

### Step 7.3 — Yield the four new tools in the Effect.gen body

Inside `Effect.gen(function* () {` (after the existing `const sessionSearch = yield* SessionSearchTool` line, around line 130):

```typescript
const delegateTask = yield* DelegateTaskTool // optional adapter only
const cronCreate   = yield* CronCreateTool
const cronList     = yield* CronListTool
const cronDelete   = yield* CronDeleteTool
```

### Step 7.4 — Add entries to `Effect.all({ ... })`

Inside the `Effect.all({ ... })` block (around line 222), add:

```typescript
delegate_task: Tool.init(delegateTask),
cron_create:   Tool.init(cronCreate),
cron_list:     Tool.init(cronList),
cron_delete:   Tool.init(cronDelete),
```

### Step 7.5 — Add the tools to the `builtin` array

In the `builtin: [...]` array (around line 247), add after `tool.session_search`:

```typescript
tool.delegate_task,
...(flags.experimentalBackgroundSubagents ? [tool.cron_create, tool.cron_list, tool.cron_delete] : []),
```

**Rationale:** `delegate_task` is always available. The cron management tools are gated behind `experimentalBackgroundSubagents` until the feature is stable, following the pattern used for `task_status`.

### Step 7.6 — Add `CronService.defaultLayer` to `defaultLayer`

At the bottom of the file (around line 373), add to the `defaultLayer` pipe chain:

```typescript
Layer.provide(CronService.defaultLayer),
```

Place it after `Layer.provide(Layer.mergeAll(SessionStatus.defaultLayer, BackgroundJob.defaultLayer))`.

---

## Task 8 — Wire `CronService.start()` into app startup

**Status:** `- [ ]`

**What:** Call `CronService.start()` during app initialization so the 60-second tick loop begins when the app layer comes up. The correct place is `src/effect/app-runtime.ts`.

### Step 8.1 — Add `CronService` to `AppLayer` imports

In `packages/opencode/src/effect/app-runtime.ts`, add after the `BackgroundJob` import:

```typescript
import { CronService } from "@/cron/cron"
```

### Step 8.2 — Add `CronService.layer` to `AppLayer`

In the `AppLayer = Layer.mergeAll(...)` block (around line 62), add after `BackgroundJob.defaultLayer`:

```typescript
CronService.layer,
```

Since `CronService.layer` requires `Session.Service`, `SessionPrompt.Service`, and `BackgroundJob.Service`, and these are all already in `AppLayer`, the merge will resolve correctly. If the Layer build errors with a missing requirement, use `Layer.provide` explicitly:

```typescript
CronService.layer.pipe(
  Layer.provide(Session.defaultLayer),
  Layer.provide(SessionPrompt.defaultLayer),
  Layer.provide(BackgroundJob.defaultLayer),
),
```

### Step 8.3 — Start the scheduler after the runtime is ready

The `CronService` scheduler needs to call `tick()` which uses `InstanceState.context` (requires an active project context). Therefore, `CronService.start()` should be called **per-project instance**, not at global startup.

The correct hook is the same place where `SessionRunState` or `SessionProcessor` initialises per-instance state — the `InstanceLayer`.

Check `packages/opencode/src/project/instance-layer.ts`:

```bash
Select-String -Path packages/opencode/src/project/instance-layer.ts -Pattern "start|BackgroundJob|CronService|onMount|effect" | Select-Object -First 30
```

If `InstanceLayer` has an `onMount` or `effect` hook for per-instance startup, call `CronService.start()` there. If not, the cleanest approach is to wire it as a Layer effect that starts when `CronService.Service` is acquired within an instance context:

```typescript
// In cron.ts layer, at the end of Effect.gen:
// Auto-start the tick loop when this service is first acquired in an instance.
yield* Effect.forkScoped(
  Effect.repeat(
    tick().pipe(Effect.catchAll(() => Effect.void)),
    Schedule.spaced("60 seconds"),
  )
)
```

This uses `Effect.forkScoped` so the fiber is automatically interrupted when the instance scope closes.

**Preferred implementation:** Replace the explicit `start()` call with `Effect.forkScoped` inside the layer's `Effect.gen` body. This matches the lifecycle model of other services in the codebase that self-start background fibers (see `SessionRunState`, `SessionStatus`). Update `cron.ts` accordingly:

```typescript
// At the end of Effect.gen in cron.ts layer, before return:
yield* Effect.forkScoped(
  Effect.repeat(
    tick().pipe(Effect.catchAll((err) =>
      Effect.sync(() => log.error("CronService.tick error", { error: String(err) }))
    )),
    Schedule.spaced("60 seconds"),
  )
)
log.info("CronService: background tick loop started")
```

With this change, `start()` and `stop()` become no-ops (or are removed) from the `Interface`, since the lifecycle is managed by the scope.

### Step 8.4 — Verify app compiles after changes

```bash
cd packages/opencode && bun run typecheck 2>&1 | head -40
```

Fix any type errors before proceeding.

---

## Task 9 — Commit all changes

**Status:** `- [ ]`

**What:** Stage and commit all new and modified files.

### Step 9.1 — Run the full test suite for the new code

```bash
bun test packages/opencode/test/subagent/ --timeout 30000
bun test packages/opencode/test/cron/ --timeout 30000
```

All tests should pass. Fix any failures before committing.

### Step 9.2 — Typecheck

```bash
cd packages/opencode; bun typecheck 2>&1 | Select-String "error|Error" | Select-Object -First 20
```

### Step 9.3 — Stage files

```bash
git add packages/opencode/src/subagent/delegate.ts
git add packages/opencode/src/cron/cron.sql.ts
git add packages/opencode/src/cron/cron.ts
git add packages/opencode/src/cron/cron-tools.ts
git add packages/opencode/src/tool/registry.ts
git add packages/opencode/src/effect/app-runtime.ts
git add packages/opencode/src/session/session.sql.ts
git add packages/opencode/test/subagent/delegate.test.ts
git add packages/opencode/test/cron/cron.test.ts
git add packages/opencode/package.json
```

### Step 9.4 — Commit

```bash
git commit -m "feat: add delegate_task tool and CronService for subagent delegation + scheduled jobs"
```

---

## File Summary

| File | Status | Description |
|------|--------|-------------|
| `packages/opencode/package.json` | Modified | Add `croner` dependency |
| `packages/opencode/src/session/session.sql.ts` | Modified by Plan 1 | Uses existing `cron_job_id` column |
| `packages/opencode/src/cron/cron.sql.ts` | New | `CronJobTable` schema (from Plan 1 Foundation) |
| `packages/opencode/src/cron/cron.ts` | New | `CronService` — create/list/delete/tick/start/stop |
| `packages/opencode/src/cron/cron-tools.ts` | New | `CronCreateTool`, `CronListTool`, `CronDeleteTool` |
| `packages/opencode/src/tool/task.ts` | Modified | Enhance existing task/subagent implementation |
| `packages/opencode/src/subagent/delegate.ts` | Optional | Thin `delegate_task` compatibility adapter |
| `packages/opencode/src/tool/registry.ts` | Modified | Register cron tools and optional adapter, add `CronService.Service` requirement |
| `packages/opencode/src/effect/app-runtime.ts` | Modified | Add `CronService.layer` to `AppLayer` |
| `packages/opencode/test/subagent/delegate.test.ts` | New | Tests for TaskTool enhancements and optional adapter |
| `packages/opencode/test/cron/cron.test.ts` | New | Tests for `CronService` |

---

## Key Decisions & Pitfalls

### 1. `InstanceState.context` in `tick()`
`tick()` calls `InstanceState.context` to get the current project ID. This means `tick()` **must run inside an Effect that has `InstanceRef` in scope** (i.e. inside a per-project instance context). If the tick loop is started at global layer level (before an instance is active), it will die with "InstanceRef not provided". The `Effect.forkScoped` approach in Task 8 Step 3 is the correct fix — it starts within the instance scope.

### 2. Existing task/session prompt interfaces
Before finalising delegation or cron implementations, verify the existing `TaskTool` and `SessionPrompt` interfaces. Do not assume a `submit` method exists:
```bash
Select-String -Path packages/opencode/src/tool/task.ts,packages/opencode/src/session/prompt.ts -Pattern "readonly|prompt|loop|background|task_status" | Select-Object -First 40
```
Adapt the existing task path instead of creating a second prompt runner.

### 3. `Identifier.ascending` usage
The `Identifier.ascending("cron")` call generates a ksuid-style ascending ID. Verify the signature:
```bash
Select-String -Path packages/opencode/src/id/id.ts -Pattern "ascending|export" | Select-Object -First 15
```
If the function signature differs, adjust accordingly.

### 4. `lte` import from `@/storage/db`
The `lte` (less-than-or-equal) operator is re-exported from `drizzle-orm` via `@/storage/db`. Confirm it is in the re-exports:
```bash
Select-String -Path packages/opencode/src/storage/db.ts -Pattern "lte|export" | Select-Object -First 10
```
If not re-exported, import directly: `import { lte } from "drizzle-orm"`.

### 5. Test layer path
The tests reference `"../helpers/test-layer"`. Check whether this helper exists:
```bash
ls packages/opencode/test/helpers/ 2>/dev/null || echo "not found"
```
If it doesn't exist, look at existing test files to find the correct test bootstrap pattern:
```bash
Get-ChildItem packages/opencode/test -Recurse | Select-String -Pattern "testLayer|AppLayer|ManagedRuntime" | Select-Object -First 20
```
Adjust the import path in both test files accordingly.

### 6. Migration for `cron_job_id` column
Plan 1 owns `cron_job_id`. If it is not present, finish Plan 1 before implementing cron.
