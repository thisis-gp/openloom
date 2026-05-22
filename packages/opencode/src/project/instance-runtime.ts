import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { type InstanceContext } from "./instance-context"
import { InstanceStore, type LoadInput } from "./instance-store"

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

// AppRuntime provides InstanceStore.Service at runtime; cast away the residual
// Service requirement at this boundary.
const run = <A, E>(eff: Effect.Effect<A, E, InstanceStore.Service>) =>
  AppRuntime.runPromise(eff as unknown as Effect.Effect<A, E, never>)

export const load = (input: LoadInput) => run(InstanceStore.Service.use((store) => store.load(input)))
export const disposeInstance = (ctx: InstanceContext) =>
  run(InstanceStore.Service.use((store) => store.dispose(ctx)))
export const disposeAllInstances = () => run(InstanceStore.Service.use((store) => store.disposeAll()))
export const reloadInstance = (input: LoadInput) =>
  run(InstanceStore.Service.use((store) => store.reload(input)))

export * as InstanceRuntime from "./instance-runtime"
