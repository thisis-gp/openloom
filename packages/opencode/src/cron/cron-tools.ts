import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { CronService } from "./cron"
import { InstanceState } from "@/effect/instance-state"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.cron" })

const CronCreateParameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "A short, human-readable name for this cron job.",
  }),
  schedule: Schema.String.annotate({
    description:
      "Cron expression (e.g. '0 9 * * *') or interval (e.g. 'every 30m', 'every 2 hours').",
  }),
  goal: Schema.String.annotate({
    description: "Complete, self-contained task for the agent on each tick.",
  }),
  agent: Schema.optional(Schema.String).annotate({
    description: "Agent mode for spawned sessions. Default: build.",
  }),
  auto_approve: Schema.optional(Schema.Boolean).annotate({
    description: "When true, spawned sessions run without approval prompts.",
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

      return {
        title: `Cron job created: ${job.name}`,
        metadata: { mode: "created" as const, job_id: job.id, next_run: job.nextRun ?? 0 },
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
    })

    return {
      description: [
        "Create a new cron job that runs a goal on a recurring schedule.",
        "Each tick spawns a child session linked via cron_job_id.",
      ].join("\n"),
      parameters: CronCreateParameters,
      execute: (params: Schema.Schema.Type<typeof CronCreateParameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)

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
        running_session_id: job.runningSessionId ?? null,
        last_error: job.lastError ?? null,
        run_count: job.runCount,
      }))

      return {
        title: `Cron jobs (${jobs.length})`,
        metadata: { mode: "list" as const, count: jobs.length },
        output: JSON.stringify({ success: true, count: jobs.length, jobs: formatted }, null, 2),
      }
    })

    return {
      description: "List all cron jobs for the current project with schedule and status fields.",
      parameters: CronListParameters,
      execute: (_params: Schema.Schema.Type<typeof CronListParameters>, ctx: Tool.Context) =>
        run(_params, ctx).pipe(Effect.orDie),
    }
  }),
)

const CronDeleteParameters = Schema.Struct({
  name_or_id: Schema.String.annotate({
    description: "The name or ID of the cron job to delete.",
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

      const match =
        jobs.find((j) => j.id === params.name_or_id) ??
        jobs.find((j) => j.name.toLowerCase() === params.name_or_id.toLowerCase())

      if (!match) {
        return yield* Effect.fail(
          new Error(
            `No cron job found with name or ID "${params.name_or_id}". Use cron_list to see available jobs.`,
          ),
        )
      }

      yield* cron.delete(match.id)

      return {
        title: `Cron job deleted: ${match.name}`,
        metadata: { mode: "deleted" as const, job_id: match.id },
        output: JSON.stringify(
          { success: true, deleted: { id: match.id, name: match.name, schedule: match.schedule } },
          null,
          2,
        ),
      }
    })

    return {
      description: "Delete a cron job by name or ID. Existing spawned sessions are not removed.",
      parameters: CronDeleteParameters,
      execute: (params: Schema.Schema.Type<typeof CronDeleteParameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
