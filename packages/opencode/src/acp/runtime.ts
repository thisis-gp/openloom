import { Agent } from "@/agent/agent"
import { AppRuntime, type AppServices } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Effect } from "effect"

// Global ACP Effect re-entry: no project InstanceRef is provided.
export const runGlobal = AppRuntime.runPromise

// Directory-scoped ACP Effect re-entry: load the project instance and provide InstanceRef.
export async function runDirectory<A, E>(input: { directory: string; effect: Effect.Effect<A, E, AppServices> }) {
  const ctx = await InstanceRuntime.load({ directory: input.directory })
  return AppRuntime.runPromise(input.effect.pipe(Effect.provideService(InstanceRef, ctx)))
}

export const defaultAgentInfo = (directory: string) =>
  runDirectory({
    directory,
    // Agent.Service.use returns Effect<A, E, Agent.Service>; AppRuntime provides
    // Agent.Service at runtime so the cast to AppServices is safe here.
    effect: Agent.Service.use((svc) => svc.defaultInfo()) as unknown as Effect.Effect<Agent.Info, never, AppServices>,
  })

export * as ACPRuntime from "./runtime"
