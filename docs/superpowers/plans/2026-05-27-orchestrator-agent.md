# Orchestrator Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenLoom a Ruflo-style orchestrator that decomposes goals into Slate tasks and delegates them to Claude CLI, Codex CLI, or Cursor workers — each tracked in Slate via the Slate CLI (not MCP).

**Architecture:** A new `orchestrator` agent uses the existing `delegate_task` tool to spawn workers. Each backend accepts a `model` flag. Workers receive Slate CLI shell commands injected into their prompt so they can call `slate task move` and `slate run log` directly via Bash — no MCP server, no protocol overhead, no extra process to manage. The orchestrator itself creates and monitors tasks using the Slate CLI via the shell tool.

**Tech Stack:** TypeScript + Effect-ts, Bun, `src/subagent/` backends, Slate CLI (`uv run --directory <slate-core> slate`), Claude CLI `--model` flag, `node:child_process` spawn.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/subagent/backends/claude-cli.ts` | Modify | Accept `model?`, pass `--model` flag |
| `src/subagent/backends/codex.ts` | Modify | Accept `model?`, pass `--model` flag |
| `src/subagent/backends/cursor.ts` | Modify | Accept `taskId?`, write Slate CLI commands into task file |
| `src/subagent/delegate.ts` | Modify | Add `model?` and `task_id?` params; export `buildWorkerPrompt` and `SLATE_CLI` |
| `src/agent/prompt/orchestrator.txt` | Create | Orchestrator system prompt using Slate CLI commands |
| `src/agent/agent.ts` | Modify | Add `orchestrator` agent to hardcoded agents map |
| `test/subagent/delegate.test.ts` | Create | Unit tests for new params + integration smoke test |

---

### Task 1: Model selection in Claude CLI and Codex backends

**Files:**
- Modify: `packages/opencode/src/subagent/backends/claude-cli.ts`
- Modify: `packages/opencode/src/subagent/backends/codex.ts`
- Create: `packages/opencode/test/subagent/delegate.test.ts`

- [ ] **Step 1: Create test file with stub tests**

Create `packages/opencode/test/subagent/delegate.test.ts`:

```typescript
import { describe, it, expect } from "bun:test"

// Stubs — real assertions added in later tasks
describe("claude-cli model flag", () => {
  it("compiles and exports runClaudeCli", async () => {
    const mod = await import("../../src/subagent/backends/claude-cli")
    expect(typeof mod.runClaudeCli).toBe("function")
  })
})

describe("codex model flag", () => {
  it("compiles and exports runCodex", async () => {
    const mod = await import("../../src/subagent/backends/codex")
    expect(typeof mod.runCodex).toBe("function")
  })
})
```

- [ ] **Step 2: Run to verify stubs pass**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts
```

Expected: PASS

- [ ] **Step 3: Update `claude-cli.ts` — add `model` to opts, pass `--model` flag**

Replace the `runClaudeCli` function signature and args array in `packages/opencode/src/subagent/backends/claude-cli.ts`:

```typescript
export async function runClaudeCli(
  goal: string,
  opts: { cwd?: string; maxTurns?: number; timeout?: number; model?: string } = {},
): Promise<ExternalAgentResult> {
  const bin = await findClaudeBin()
  if (!bin) {
    return {
      output: "Claude CLI not found. Ensure 'claude' is in PATH.",
      exitCode: 1,
    }
  }

  const args: string[] = [
    "--print",
    "--output-format", "text",
    "--max-turns", String(opts.maxTurns ?? 10),
    "-p", goal,
  ]

  if (opts.model) args.unshift("--model", opts.model)

  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 10 * 60 * 1000

  log.info("claude -p", { cwd, goal: goal.slice(0, 80), model: opts.model })

  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.stderr.on("data", (c: Buffer) => chunks.push(c.toString()))

    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      chunks.push("\n[Claude CLI: timed out]")
    }, timeout)

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ output: chunks.join(""), exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ output: `Claude CLI spawn error: ${err.message}`, exitCode: 1 })
    })
  })
}
```

- [ ] **Step 4: Update `codex.ts` — add `model` to opts, pass `--model` flag**

Replace the `runCodex` signature and args in `packages/opencode/src/subagent/backends/codex.ts`:

```typescript
export async function runCodex(
  goal: string,
  opts: { cwd?: string; timeout?: number; model?: string } = {},
): Promise<ExternalAgentResult> {
  const bin = await findBin("codex")
  if (!bin) {
    return {
      output: "Codex CLI not found. Install: npm install -g @openai/codex && codex login",
      exitCode: 1,
    }
  }

  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 5 * 60 * 1000
  const args = ["exec", "--quiet", ...(opts.model ? ["--model", opts.model] : []), "-"]

  log.info("codex exec", { cwd, goal: goal.slice(0, 80), model: opts.model })

  return spawnWithTimeout(bin, args, { cwd, stdin: goal, timeout })
}
```

- [ ] **Step 5: Typecheck**

```
cd packages/opencode
bun typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```
git add packages/opencode/src/subagent/backends/claude-cli.ts packages/opencode/src/subagent/backends/codex.ts packages/opencode/test/subagent/delegate.test.ts
git commit -m "feat: add model selection to claude-cli and codex backends"
```

---

### Task 2: Add `model` and `task_id` to `delegate_task`, inject Slate CLI commands

**Files:**
- Modify: `packages/opencode/src/subagent/delegate.ts`

The Slate CLI command prefix is:
```
uv run --directory "C:\Users\am400\Desktop\Projects\slate\packages\core" slate
```

Workers run this via their shell tool — no MCP server, no extra process.

- [ ] **Step 1: Write failing tests**

Add to `packages/opencode/test/subagent/delegate.test.ts`:

```typescript
import { buildWorkerPrompt, SLATE_CLI } from "../../src/subagent/delegate"

describe("buildWorkerPrompt", () => {
  it("returns plain goal when no task_id provided", () => {
    const result = buildWorkerPrompt("Fix the login bug", undefined, "claude-worker")
    expect(result).toBe("Fix the login bug")
  })

  it("injects slate CLI commands when task_id is provided", () => {
    const result = buildWorkerPrompt("Fix the login bug", "abc-123", "claude-worker")
    expect(result).toContain("abc-123")
    expect(result).toContain("slate task move")
    expect(result).toContain("slate run log")
    expect(result).toContain("in_progress")
    expect(result).toContain("done")
  })

  it("uses the provided agent name in --by flag", () => {
    const result = buildWorkerPrompt("Fix the login bug", "abc-123", "codex-worker")
    expect(result).toContain("--by codex-worker")
  })
})

describe("SLATE_CLI", () => {
  it("is a non-empty string", () => {
    expect(typeof SLATE_CLI).toBe("string")
    expect(SLATE_CLI.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts --test-name-pattern "buildWorkerPrompt|SLATE_CLI"
```

Expected: FAIL — `buildWorkerPrompt` and `SLATE_CLI` not exported

- [ ] **Step 3: Replace `delegate.ts` with new version**

Replace `packages/opencode/src/subagent/delegate.ts` entirely:

```typescript
import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "@/tool/tool"
import { TaskTool, type TaskParameters } from "../tool/task"
import { runCodex, codexAvailable } from "./backends/codex"
import { runClaudeCli, claudeCliAvailable } from "./backends/claude-cli"
import { dropCursorTask } from "./backends/cursor"

const DEFAULT_BLOCKLIST = ["delegate_task", "cron_create", "cron_delete", "cron_list", "memory_graph"] as const

const SLATE_CORE_DIR = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? "",
  "Desktop", "Projects", "slate", "packages", "core",
)

export const SLATE_CLI = `uv run --directory "${SLATE_CORE_DIR}" slate`

export function buildWorkerPrompt(
  goal: string,
  taskId: string | undefined,
  agentName: string,
): string {
  if (!taskId) return goal

  return `${goal}

---
SLATE TASK TRACKING (task_id: ${taskId}):
You MUST run the following shell commands at the right times:

# 1. When you start working:
${SLATE_CLI} task move ${taskId} in_progress --by ${agentName}

# 2. When you finish (replace <summary> with one sentence of what you did):
${SLATE_CLI} run log ${taskId} "<summary>" --agent ${agentName} --tool bash --commit $(git rev-parse --short HEAD 2>/dev/null || echo "")
${SLATE_CLI} task move ${taskId} done --by ${agentName}

# 3. If you are blocked and cannot complete the task:
${SLATE_CLI} task move ${taskId} blocked --by ${agentName} --reason "<why you are blocked>"
`
}

const Parameters = Schema.Struct({
  goal: Schema.String.annotate({
    description:
      "The complete, self-contained task description for the subagent. Include all context it needs — it cannot ask the parent for clarification.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description:
      "Agent mode. Options: 'build' (default, internal), 'codex' (Codex CLI), 'claude' (Claude Code CLI), 'cursor' (Cursor file-drop).",
  }),
  model: Schema.optional(Schema.String).annotate({
    description:
      "Model to use for the worker. For claude: 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'. For codex: 'o4-mini', 'gpt-4o'. Ignored for 'build' and 'cursor'.",
  }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "Slate task ID. When provided, the worker receives shell commands to update task state and log its run via the Slate CLI.",
  }),
  await: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true (default), block until the subagent completes. When false, fire-and-forget.",
  }),
  toolset_blocklist: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Additional tool IDs to deny the subagent. delegate_task, cron_create, cron_delete, cron_list, and memory_graph are always blocked.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

function agentName(agent: string): string {
  const map: Record<string, string> = {
    claude: "claude-worker",
    codex: "codex-worker",
    cursor: "cursor-worker",
    build: "build-worker",
  }
  return map[agent] ?? `${agent}-worker`
}

function toTaskParams(params: Params): TaskParameters {
  const extraBlock = params.toolset_blocklist ?? []
  const blockNote =
    extraBlock.length > 0
      ? `\n\n[Subagent tool restrictions: ${[...DEFAULT_BLOCKLIST, ...extraBlock].join(", ")}]`
      : ""
  const prompt = buildWorkerPrompt(params.goal, params.task_id, agentName(params.agent ?? "build"))
  return {
    description: `Delegated: ${params.goal.slice(0, 40)}${params.goal.length > 40 ? "…" : ""}`,
    prompt: prompt + blockNote,
    subagent_type: params.agent ?? "build",
    background: params.await === false ? true : undefined,
  }
}

export const DelegateTaskTool = Tool.define(
  "delegate_task",
  Effect.gen(function* () {
    const taskInfo = yield* TaskTool
    const task = yield* Tool.init(taskInfo)

    return {
      description: [
        "Delegate a self-contained goal to a child agent session.",
        "Supports agent='claude', 'codex', 'cursor', or 'build' (default).",
        "Pass model= to select a specific LLM for claude/codex workers.",
        "Pass task_id= (Slate task ID) to have the worker auto-update task state via the Slate CLI.",
        `Always blocked for children: ${DEFAULT_BLOCKLIST.join(", ")}.`,
      ].join(" "),
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) => {
        const agent = params.agent ?? "build"
        const workerName = agentName(agent)
        const prompt = buildWorkerPrompt(params.goal, params.task_id, workerName)

        if (agent === "codex") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const ok = await codexAvailable()
            const output = ok
              ? (await runCodex(prompt, { model: params.model })).output || "Codex completed."
              : "Codex CLI not installed. Run: npm install -g @openai/codex && codex login"
            return { title: "codex", metadata: { task_id: params.task_id }, output }
          }).pipe(Effect.orDie)
        }

        if (agent === "claude") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const ok = await claudeCliAvailable()
            if (!ok) return { title: "claude", metadata: {}, output: "Claude CLI not found in PATH." }
            const result = await runClaudeCli(prompt, { model: params.model })
            return { title: "claude", metadata: { task_id: params.task_id }, output: result.output || "Claude CLI completed." }
          }).pipe(Effect.orDie)
        }

        if (agent === "cursor") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const { taskFile } = await dropCursorTask(prompt, { taskId: params.task_id })
            return { title: "cursor", metadata: { task_id: params.task_id }, output: `Task dropped to Cursor: ${taskFile}` }
          }).pipe(Effect.orDie)
        }

        return task.execute(toTaskParams(params), ctx).pipe(Effect.orDie)
      },
    }
  }),
)
```

- [ ] **Step 4: Run tests**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```
cd packages/opencode
bun typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```
git add packages/opencode/src/subagent/delegate.ts packages/opencode/test/subagent/delegate.test.ts
git commit -m "feat: add model/task_id to delegate_task with Slate CLI worker instructions"
```

---

### Task 3: Cursor backend — embed Slate CLI commands in task file

**Files:**
- Modify: `packages/opencode/src/subagent/backends/cursor.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/opencode/test/subagent/delegate.test.ts`:

```typescript
import { dropCursorTask } from "../../src/subagent/backends/cursor"
import { readFileSync, existsSync } from "fs"

describe("dropCursorTask", () => {
  it("creates a task file containing the goal", async () => {
    const { taskFile } = await dropCursorTask("Implement login form", {})
    expect(existsSync(taskFile)).toBe(true)
    const content = readFileSync(taskFile, "utf8")
    expect(content).toContain("Implement login form")
  })

  it("includes the goal text verbatim (which may already have slate instructions)", async () => {
    const goalWithSlate = "Fix auth bug\n---\nSLATE TASK TRACKING (task_id: abc-123)"
    const { taskFile } = await dropCursorTask(goalWithSlate, { taskId: "abc-123" })
    const content = readFileSync(taskFile, "utf8")
    expect(content).toContain("abc-123")
    expect(content).toContain("slate task move")
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts --test-name-pattern "dropCursorTask"
```

Expected: FAIL — opts signature mismatch

- [ ] **Step 3: Update `cursor.ts`**

Replace `packages/opencode/src/subagent/backends/cursor.ts` entirely:

```typescript
import fs from "fs"
import path from "path"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.cursor" })

/**
 * Drop a task file into .cursor/tasks/ for Cursor Background Agent to pick up.
 * The goal string already contains Slate CLI instructions when task_id is set
 * (injected by buildWorkerPrompt in delegate.ts).
 */
export async function dropCursorTask(
  goal: string,
  opts: { cwd?: string; taskId?: string } = {},
): Promise<{ taskFile: string }> {
  const cwd = opts.cwd ?? process.cwd()
  const tasksDir = path.join(cwd, ".cursor", "tasks")
  fs.mkdirSync(tasksDir, { recursive: true })

  const id = Date.now()
  const taskFile = path.join(tasksDir, `openloom-${id}.md`)
  fs.writeFileSync(taskFile, `# OpenLoom Task\n\n${goal}\n`, "utf8")

  log.info("cursor task dropped", { taskFile, taskId: opts.taskId })
  return { taskFile }
}
```

Note: the goal already contains the Slate CLI instructions from `buildWorkerPrompt` — no duplication needed here. The cursor backend just writes the full prompt as-is.

- [ ] **Step 4: Run tests**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts --test-name-pattern "dropCursorTask"
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```
cd packages/opencode
bun typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```
git add packages/opencode/src/subagent/backends/cursor.ts packages/opencode/test/subagent/delegate.test.ts
git commit -m "feat: cursor backend accepts taskId opt, writes full goal (incl slate CLI) to task file"
```

---

### Task 4: Orchestrator agent system prompt

**Files:**
- Create: `packages/opencode/src/agent/prompt/orchestrator.txt`

- [ ] **Step 1: Create the orchestrator prompt file**

Create `packages/opencode/src/agent/prompt/orchestrator.txt`:

```
You are the OpenLoom Orchestrator. You decompose user goals into discrete tasks, delegate each to the right worker agent, and synthesize results.

You interact with Slate using the CLI. The Slate CLI command prefix is:
  uv run --directory "C:\Users\am400\Desktop\Projects\slate\packages\core" slate

Alias it as: SLATE="uv run --directory \"C:\Users\am400\Desktop\Projects\slate\packages\core\" slate"

## Your Process

1. **Understand the goal.** Ask one clarifying question if the scope is genuinely ambiguous. Otherwise proceed.

2. **Create a Slate project** (if one does not exist for this workspace):
   $SLATE project create "<repo-name>" --key <2-4 UPPERCASE LETTERS>
   Capture the project ID from stdout (looks like: Created project <name> (uuid)).

3. **Decompose into tasks** (max 5). Each must be:
   - Independently completable by one worker.
   - Described with full context (the worker cannot ask you questions).
   - Assigned to the right worker: claude-worker, codex-worker, or cursor-worker.

4. **Create each task in Slate and capture its ID:**
   $SLATE task create "<title>" --project <project_id> --desc "<full context>" --assign <worker> --type feature --priority medium
   The task ID is in the output: Created task <title> (first 8 chars of uuid).
   Use `$SLATE task list --project <project_id>` to get full IDs if needed.

5. **Delegate each task** using the delegate_task tool:
   - `goal`: the same full description you put in Slate.
   - `agent`: "claude", "codex", or "cursor".
   - `model`: pick based on complexity:
     - Simple / fast: "claude-haiku-4-5"
     - Standard: "claude-sonnet-4-6"
     - Complex reasoning: "claude-opus-4-7"
     - OpenAI: "o4-mini" (fast) or "gpt-4o" (complex)
   - `task_id`: the full Slate task ID.
   - `await`: true (default). Use false only for fully independent parallel tasks.

6. **Monitor and synthesize.**
   After all workers complete, run:
   $SLATE task list --project <project_id>
   Check states. If any task is "blocked", report the blocker and ask the user how to proceed.
   Summarize what each worker did and the overall outcome.

## Worker Selection Guide

| Worker     | agent=   | Best for                                         |
|------------|----------|--------------------------------------------------|
| Claude CLI | "claude" | Code generation, refactors, research, writing    |
| Codex CLI  | "codex"  | OpenAI-model tasks; Python-heavy work            |
| Cursor     | "cursor" | IDE-native edits, multi-file workspace changes   |

## Rules

- Create ALL Slate tasks before delegating any — you need the task IDs.
- Never delegate more than one task to the same worker simultaneously (they share the filesystem).
- If Slate CLI fails (uv not installed, project path wrong), continue without tracking but warn the user.
- Do not implement anything yourself. Your role is coordination only.
- One status line per task delegated; one status line per task completed.
```

- [ ] **Step 2: Verify file exists**

```
type packages\opencode\src\agent\prompt\orchestrator.txt | head
```

Expected: first lines of the prompt appear.

- [ ] **Step 3: Commit**

```
git add packages/opencode/src/agent/prompt/orchestrator.txt
git commit -m "feat: add orchestrator agent system prompt using Slate CLI"
```

---

### Task 5: Register orchestrator agent in `agent.ts`

**Files:**
- Modify: `packages/opencode/src/agent/agent.ts`

- [ ] **Step 1: Add the prompt import**

In `packages/opencode/src/agent/agent.ts`, find the existing prompt imports (around line 9):

```typescript
import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SCOUT from "./prompt/scout.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
```

Add after the last import line:

```typescript
import PROMPT_ORCHESTRATOR from "./prompt/orchestrator.txt"
```

- [ ] **Step 2: Add orchestrator to the agents map**

In `agent.ts`, find the `general` agent entry (ends with `mode: "subagent", native: true,`). Add the `orchestrator` entry directly after it, before the `explore` entry:

```typescript
          orchestrator: {
            name: "orchestrator",
            description:
              "Decomposes goals into Slate tasks and delegates each to Claude CLI, Codex CLI, or Cursor workers. Use when the user wants a multi-step workflow coordinated across multiple workers.",
            prompt: PROMPT_ORCHESTRATOR,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                delegate_task: "allow",
                bash: "allow",
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "primary",
            native: true,
          },
```

- [ ] **Step 3: Typecheck**

```
cd packages/opencode
bun typecheck
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```
git add packages/opencode/src/agent/agent.ts
git commit -m "feat: register orchestrator agent in agent service"
```

---

### Task 6: Smoke tests

**Files:**
- Modify: `packages/opencode/test/subagent/delegate.test.ts`

- [ ] **Step 1: Add integration smoke test for claude worker**

Append to `packages/opencode/test/subagent/delegate.test.ts`:

```typescript
import { claudeCliAvailable, runClaudeCli } from "../../src/subagent/backends/claude-cli"

describe("claude-cli integration smoke", () => {
  it("passes --model flag and gets a response (skipped if claude not in PATH)", async () => {
    const available = await claudeCliAvailable()
    if (!available) {
      console.log("  [SKIP] claude not in PATH")
      return
    }
    const result = await runClaudeCli("Reply with exactly the word: SMOKE_OK", {
      model: "claude-haiku-4-5",
      maxTurns: 3,
      timeout: 60_000,
    })
    expect(result.output).toContain("SMOKE_OK")
    expect(result.exitCode).toBe(0)
  })
})

describe("buildWorkerPrompt integration", () => {
  it("injected slate CLI commands use the correct binary path", () => {
    const { buildWorkerPrompt, SLATE_CLI } = require("../../src/subagent/delegate")
    const prompt = buildWorkerPrompt("Do something", "task-abc-123", "claude-worker")
    expect(prompt).toContain(SLATE_CLI)
    expect(prompt).toContain("task-abc-123")
    expect(prompt).toContain("in_progress")
    expect(prompt).toContain("done")
  })
})
```

- [ ] **Step 2: Run all tests**

```
cd packages/opencode
bun test test/subagent/delegate.test.ts
```

Expected:
- All unit tests: PASS
- Integration smoke: PASS (if claude in PATH) or prints SKIP and passes

- [ ] **Step 3: Final typecheck**

```
cd packages/opencode
bun typecheck
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```
git add packages/opencode/test/subagent/delegate.test.ts
git commit -m "test: smoke tests for delegate_task model flag and slate CLI injection"
```

---

## Self-Review

**Spec coverage:**
- ✅ Model selection: `--model` passed to claude-cli (Task 1) and codex (Task 1)
- ✅ `task_id` param in `delegate_task` (Task 2)
- ✅ `buildWorkerPrompt` injects Slate CLI shell commands (Task 2)
- ✅ `SLATE_CLI` constant exported for use in orchestrator prompt (Task 2)
- ✅ Cursor task file contains the full prompt including Slate CLI commands (Task 3)
- ✅ Orchestrator system prompt with Slate CLI workflow (Task 4)
- ✅ Orchestrator agent registered in `agent.ts` (Task 5)
- ✅ Smoke tests (Task 6)
- ✅ No MCP server dependency anywhere — all Slate interaction is plain shell commands

**Placeholder scan:** None found.

**Type consistency:**
- `buildWorkerPrompt(goal, taskId, agentName)` — defined in Task 2, tested in Task 2 and Task 6 ✅
- `dropCursorTask(goal, { taskId })` — updated in Task 3, test uses same signature ✅
- `runClaudeCli(goal, { model })` — Task 1 signature, used in Task 2 delegate.ts ✅
- `runCodex(goal, { model })` — Task 1 signature, used in Task 2 delegate.ts ✅
- `SLATE_CLI` — exported from `delegate.ts` in Task 2, used in orchestrator prompt in Task 4 ✅
