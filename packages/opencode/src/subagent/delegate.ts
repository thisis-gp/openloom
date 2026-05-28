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
