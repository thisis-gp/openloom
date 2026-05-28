import { Context, Effect, Layer, Schedule, Scope } from "effect"
import { Database, eq, and, lte, isNull } from "@/storage/db"
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
import { CuratorJob } from "./curator"

const log = Log.create({ service: "cron" })

const CRON_CHILD_BLOCKLIST = ["delegate_task", "task", "cron_job"]

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
  runningSessionId: string | undefined
  lastError: string | undefined
  runCount: number
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
  readonly create: (input: CreateInput) => Effect.Effect<CronJob, Error>
  readonly list: (projectID: string) => Effect.Effect<CronJob[]>
  readonly delete: (id: string) => Effect.Effect<void>
  readonly tick: () => Effect.Effect<void>
  readonly startLoop: (scope: Scope.Scope) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/CronService") {}

export function computeNextRun(schedule: string): number | undefined {
  const parsed = parseSchedule(schedule)
  if (!parsed) return undefined
  if (parsed.kind === "interval") return Date.now() + parsed.ms
  const next = parsed.cron.nextRun()
  return next?.getTime()
}

function parseSchedule(schedule: string):
  | { kind: "cron"; cron: Cron }
  | { kind: "interval"; ms: number }
  | undefined {
  const every = schedule.trim().match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)$/i)
  if (every) {
    const amount = Number(every[1])
    const unit = every[2]!.toLowerCase()
    const ms = unit.startsWith("h") ? amount * 60 * 60 * 1000 : amount * 60 * 1000
    return { kind: "interval", ms }
  }
  try {
    return { kind: "cron", cron: new Cron(schedule) }
  } catch {
    return undefined
  }
}

function validateSchedule(schedule: string): string | undefined {
  if (parseSchedule(schedule)) return undefined
  return `Unrecognized schedule "${schedule}"`
}

function rowToJob(row: typeof CronJobTable.$inferSelect): CronJob {
  return {
    id: row.id,
    projectID: row.project_id,
    name: row.name,
    schedule: row.schedule,
    goal: row.goal,
    agent: row.agent,
    toolsetBlocklist: row.toolset_blocklist ?? [],
    autoApprove: row.auto_approve === 1,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    lastSessionId: row.last_session_id ?? undefined,
    runningSessionId: row.running_session_id ?? undefined,
    lastError: row.last_error ?? undefined,
    runCount: row.run_count,
  }
}

function blockTools(extra: string[] = []) {
  return [...CRON_CHILD_BLOCKLIST, ...extra].reduce(
    (acc, tool) => {
      acc[tool] = false
      return acc
    },
    {} as Record<string, boolean>,
  )
}

export const layer: Layer.Layer<Service, never, Session.Service | BackgroundJob.Service | SessionPrompt.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service

    const runJob = Effect.fn("CronService.runJob")(function* (job: typeof CronJobTable.$inferSelect) {
      const now = Date.now()
      const child = yield* sessions.create({
        title: `Cron: ${job.name}`,
        agent: job.agent,
      })

      Database.use((db) =>
        db
          .update(SessionTable)
          .set({ cron_job_id: job.id, time_updated: now })
          .where(eq(SessionTable.id, child.id))
          .run(),
      )

      Database.use((db) =>
        db
          .update(CronJobTable)
          .set({ running_session_id: child.id, last_error: null, time_updated: now })
          .where(eq(CronJobTable.id, job.id))
          .run(),
      )

      yield* prompt.prompt({
        sessionID: child.id,
        agent: job.agent,
        parts: [{ type: "text", text: job.goal }],
        tools: blockTools(job.toolset_blocklist ?? []),
      })
      yield* prompt.loop({ sessionID: child.id })

      const nextRun = computeNextRun(job.schedule)
      Database.use((db) =>
        db
          .update(CronJobTable)
          .set({
            last_run: now,
            last_session_id: child.id,
            running_session_id: null,
            next_run: nextRun ?? null,
            run_count: job.run_count + 1,
            last_error: null,
            time_updated: Date.now(),
          })
          .where(eq(CronJobTable.id, job.id))
          .run(),
      )

      return child.id
    })

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
              isNull(CronJobTable.running_session_id),
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
          yield* background
            .start({
              id: jobID,
              type: "cron_job",
              title: `Cron: ${job.name}`,
              metadata: { cronJobId: job.id, projectId: job.project_id },
              run: runJob(job).pipe(
                Effect.map((sessionID) => sessionID as string),
                Effect.catch(() => Effect.succeed("")),
              ) as unknown as Effect.Effect<string, unknown>,
            })
            .pipe(Effect.asVoid)
        }),
        { concurrency: 1, discard: true },
      )
    })

    const startLoop: Interface["startLoop"] = (scope) => {
      // Curator startup catch-up: if we missed the weekly window, fork a background run
      const curatorState = CuratorJob.readState()
      if (CuratorJob.shouldRunNow(curatorState.lastRunAt)) {
        log.info("curator: missed window detected on startup, scheduling background run")
        const daemonEffect = Effect.tryPromise(async () => {
          log.info("curator: background run starting")
          CuratorJob.writeState({
            ...curatorState,
            lastRunAt: Date.now(),
          })
        }).pipe(
          Effect.catch(() => Effect.sync(() => log.error("curator startup run failed"))),
        )
        void Effect.runFork(daemonEffect)
      }

      return Effect.repeat(
        tick().pipe(
          Effect.catch((err: unknown) =>
            Effect.sync(() => log.error("CronService.tick error", { error: String(err) })),
          ),
        ),
        Schedule.spaced("60 seconds"),
      ).pipe(
        Effect.tap(() => Effect.sync(() => log.info("CronService: instance tick loop started"))),
        Effect.forkIn(scope),
        Effect.asVoid,
      )
    }

    const create: Interface["create"] = Effect.fn("CronService.create")(function* (input) {
      const validationError = validateSchedule(input.schedule)
      if (validationError) {
        return yield* Effect.fail(new Error(`Invalid cron schedule "${input.schedule}": ${validationError}`))
      }

      const id = Identifier.ascending("job")
      const nextRun = computeNextRun(input.schedule)
      const now = Date.now()

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
            run_count: 0,
            time_created: now,
            time_updated: now,
          })
          .run(),
      )

      const row = Database.use((db) => db.select().from(CronJobTable).where(eq(CronJobTable.id, id)).get())!
      return rowToJob(row)
    })

    const list: Interface["list"] = Effect.fn("CronService.list")(function* (projectID) {
      const rows = Database.use((db) =>
        db.select().from(CronJobTable).where(eq(CronJobTable.project_id, projectID as ProjectID)).all(),
      )
      return rows.map(rowToJob)
    })

    const delete_: Interface["delete"] = Effect.fn("CronService.delete")(function* (id) {
      Database.use((db) => db.delete(CronJobTable).where(eq(CronJobTable.id, id)).run())
    })

    return Service.of({ create, list, delete: delete_, tick, startLoop })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provideMerge(Session.defaultLayer),
  Layer.provideMerge(BackgroundJob.defaultLayer),
)

/** No-op layer for contexts where cron scheduling is not needed (e.g. test fixtures, ToolRegistry.defaultLayer). */
export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    create: () => Effect.fail(new Error("CronService not available")),
    list: () => Effect.succeed([]),
    delete: () => Effect.void,
    tick: () => Effect.void,
    startLoop: () => Effect.void,
  }),
)

export * as CronService from "./cron"
