import { Effect, Layer, Context, Stream } from "effect"
import { spawn } from "child_process"
import * as Log from "@openloom/core/util/log"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { isLifecycleEventType } from "./events"

const log = Log.create({ service: "lifecycle.hooks" })

type HookConfig = {
  command: string
  shell?: string
  timeout?: number
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

export const layer = Layer.effect(
  HooksService,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const config = yield* Config.Service

    function getHooksConfig(): Effect.Effect<HooksConfig> {
      return Effect.gen(function* () {
        const cfg = yield* config.get()
        return ((cfg as unknown as Record<string, unknown>).hooks ?? {}) as HooksConfig
      }).pipe(Effect.orElseSucceed((): HooksConfig => ({})))
    }

    function dispatch(eventType: string, properties: unknown): Effect.Effect<void> {
      return Effect.gen(function* () {
        const hooksConfig = yield* getHooksConfig()
        const hooks = hooksConfig[eventType] ?? []
        for (const hook of hooks) {
          spawnHook(hook, eventType, properties)
        }
      })
    }

    // Subscribe to all lifecycle events on the bus and dispatch hooks
    yield* Stream.runForEach(bus.subscribeAll(), (event) => {
      if (!isLifecycleEventType(event.type)) return Effect.void
      return dispatch(event.type, event.properties)
    }).pipe(Effect.forkDetach)

    return HooksService.of({ dispatch })
  }),
)
