import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { CronService } from "./cron"
import { InstanceState } from "@/effect/instance-state"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.cron" })

type CronJobMetadata = {
  mode?: string
  job_id?: string
  next_run?: number
  count?: number
  [key: string]: unknown
}

const Parameters = Schema.Struct({
  action: Schema.Literals(["create", "list", "delete"]).annotate({
    description: "Action to perform: 'create' a new job, 'list' all jobs, or 'delete' a job by name or id.",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Required for create. A short human-readable name for this cron job.",
  }),
  schedule: Schema.optional(Schema.String).annotate({
    description: "Required for create. Cron expression (e.g. '0 9 * * *') or interval (e.g. 'every 30m').",
  }),
  goal: Schema.optional(Schema.String).annotate({
    description: "Required for create. Complete, self-contained task for the agent on each tick.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "For create. Agent mode for spawned sessions. Default: build.",
  }),
  auto_approve: Schema.optional(Schema.Boolean).annotate({
    description: "For create. When true, spawned sessions run without approval prompts.",
  }),
  id: Schema.optional(Schema.String).annotate({
    description: "Required for delete. The name or ID of the cron job to delete.",
  }),
})

export const CronJobTool = Tool.define(
  "cron_job",
  Effect.gen(function* () {
    const cron = yield* CronService.Service

    const run = Effect.fn("CronJobTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      _ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context

      if (params.action === "create") {
        if (!params.name || !params.schedule || !params.goal) {
          return {
            title: "cron_job create: missing fields",
            metadata: {},
            output: "Error: name, schedule, and goal are required for action=create",
          }
        }
        const job = yield* cron.create({
          projectID: instance.project.id,
          name: params.name,
          schedule: params.schedule,
          goal: params.goal,
          agent: params.agent ?? "build",
          autoApprove: params.auto_approve ?? false,
        })
        log.info("cron_job: job created", { id: job.id, name: job.name })
        return {
          title: `Cron job created: ${job.name}`,
          metadata: { mode: "created", job_id: job.id, next_run: job.nextRun ?? 0 },
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
                next_run: job.nextRun ? new Date(job.nextRun).toISOString() : null,
              },
            },
            null,
            2,
          ),
        }
      }

      if (params.action === "list") {
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
          running_session_id: job.runningSessionId ?? null,
          last_error: job.lastError ?? null,
          run_count: job.runCount,
        }))
        return {
          title: `Cron jobs (${jobs.length})`,
          metadata: { mode: "listed", count: jobs.length },
          output: JSON.stringify({ success: true, count: jobs.length, jobs: formatted }, null, 2),
        }
      }

      if (params.action === "delete") {
        if (!params.id) {
          return {
            title: "cron_job delete: missing id",
            metadata: {},
            output: "Error: id is required for action=delete",
          }
        }
        const jobs = yield* cron.list(instance.project.id)
        const match =
          jobs.find((j) => j.id === params.id) ??
          jobs.find((j) => j.name.toLowerCase() === params.id!.toLowerCase())

        if (!match) {
          return yield* Effect.fail(
            new Error(
              `No cron job found with name or ID "${params.id}". Use action='list' to see available jobs.`,
            ),
          )
        }

        yield* cron.delete(match.id)
        log.info("cron_job: job deleted", { id: match.id, name: match.name })
        return {
          title: `Cron job deleted: ${match.name}`,
          metadata: { mode: "deleted", job_id: match.id },
          output: JSON.stringify(
            { success: true, deleted: { id: match.id, name: match.name, schedule: match.schedule } },
            null,
            2,
          ),
        }
      }

      return {
        title: "cron_job: unknown action",
        metadata: {},
        output: `Unknown action: ${(params as any).action}. Use 'create', 'list', or 'delete'.`,
      }
    })

    return {
      description: [
        "Manage scheduled cron jobs.",
        "Use action='create' to schedule a recurring agent task (requires name, schedule, goal).",
        "Use action='list' to see all jobs for the current project.",
        "Use action='delete' to remove a job by name or id.",
      ].join(" "),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<CronJobMetadata>> =>
        run(params, ctx).pipe(Effect.orDie) as Effect.Effect<Tool.ExecuteResult<CronJobMetadata>>,
    }
  }),
)
