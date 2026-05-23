import { EOL } from "os"
import { Effect } from "effect"
import { Config } from "@/config/config"
import { effectCmd, type CliError } from "../../effect-cmd"
import type { AppServices } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"

export const ConfigCommand = effectCmd({
  command: "config",
  describe: "show resolved configuration",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.config")(function* (_args) {
    const config = yield* Config.Service.use((cfg) => cfg.get())
    process.stdout.write(JSON.stringify(config, null, 2) + EOL)
  }) as unknown as (_args: unknown) => Effect.Effect<void, CliError, AppServices | InstanceStore.Service>,
})
