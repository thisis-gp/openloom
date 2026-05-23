import { EOL } from "os"
import { Effect } from "effect"
import { Skill } from "../../../skill"
import { effectCmd, type CliError } from "../../effect-cmd"
import type { AppServices } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"

export const SkillCommand = effectCmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.skill")(function* (_args) {
    const skill = yield* Skill.Service
    const skills = yield* skill.all()
    process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
  }) as unknown as (_args: unknown) => Effect.Effect<void, CliError, AppServices | InstanceStore.Service>,
})
