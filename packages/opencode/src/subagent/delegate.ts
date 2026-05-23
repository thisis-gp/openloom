import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { TaskTool, type TaskParameters } from "../tool/task"
import { runCodex, codexAvailable } from "./backends/codex"
import { runClaudeCli, claudeCliAvailable } from "./backends/claude-cli"
import { dropCursorTask } from "./backends/cursor"

const DEFAULT_BLOCKLIST = ["delegate_task", "cron_create", "cron_delete", "cron_list", "memory_graph"] as const

const Parameters = Schema.Struct({
  goal: Schema.String.annotate({
    description:
      "The complete, self-contained task description for the subagent. Include all context it needs — it cannot ask the parent for clarification.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description:
      "Agent mode. Options: 'build' (default, internal), 'codex' (Codex CLI), 'claude' (Claude Code CLI), 'cursor' (Cursor file-drop).",
  }),
  await: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true (default), block until the subagent completes. When false, fire-and-forget with task_status polling.",
  }),
  toolset_blocklist: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Additional tool IDs to deny the subagent. delegate_task, cron_create, cron_delete, cron_list, and memory_graph are always blocked.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

function toTaskParams(params: Params): TaskParameters {
  const extraBlock = params.toolset_blocklist ?? []
  const blockNote =
    extraBlock.length > 0
      ? `\n\n[Subagent tool restrictions: ${[...DEFAULT_BLOCKLIST, ...extraBlock].join(", ")}]`
      : ""
  return {
    description: `Delegated: ${params.goal.slice(0, 40)}${params.goal.length > 40 ? "…" : ""}`,
    prompt: params.goal + blockNote,
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
        "Uses the same execution path as the task tool.",
        `Always blocked for children: ${DEFAULT_BLOCKLIST.join(", ")}.`,
        "The tools delegate_task, cron_create, and cron_delete are always blocked for child sessions.",
      ].join(" "),
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) => {
        const agent = params.agent ?? "build"

        if (agent === "codex") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const ok = await codexAvailable()
            const output = ok
              ? (await runCodex(params.goal)).output || "Codex completed."
              : "Codex CLI not installed. Run: npm install -g @openai/codex && codex login"
            return { title: "codex", metadata: {}, output }
          }).pipe(Effect.orDie)
        }

        if (agent === "claude") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const ok = await claudeCliAvailable()
            const output = ok
              ? (await runClaudeCli(params.goal)).output || "Claude CLI completed."
              : "Claude CLI not found in PATH."
            return { title: "claude", metadata: {}, output }
          }).pipe(Effect.orDie)
        }

        if (agent === "cursor") {
          return Effect.tryPromise(async (): Promise<Tool.ExecuteResult> => {
            const { taskFile } = await dropCursorTask(params.goal)
            return { title: "cursor", metadata: {}, output: `Task dropped to Cursor: ${taskFile}` }
          }).pipe(Effect.orDie)
        }

        return task.execute(toTaskParams(params), ctx).pipe(Effect.orDie)
      },
    }
  }),
)
