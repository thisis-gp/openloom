import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { sshRun } from "@/shell/backends/ssh"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.ssh" })

const SSHParams = Schema.Struct({
  command: Schema.String,
  host: Schema.String,
  port: Schema.optional(Schema.Number),
  username: Schema.String,
  password: Schema.optional(Schema.String),
  privateKey: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
})

export const SSHTool = Tool.define(
  "ssh",
  Effect.succeed({
    description:
      "Execute a shell command on a remote host over SSH. Provide either password or privateKey (file path or PEM string) for authentication. Returns combined stdout+stderr output and exit code.",
    parameters: SSHParams,
    execute(params: Schema.Schema.Type<typeof SSHParams>, _ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult> {
      return Effect.gen(function* () {
        if (!params.password && !params.privateKey) {
          return {
            title: "SSH auth missing",
            metadata: {},
            output: "Error: provide either password or privateKey",
          }
        }

        const lines: string[] = []
        const onData = (chunk: string) => lines.push(chunk)

        log.info("ssh execute", { host: params.host, command: params.command.slice(0, 80) })

        const result = yield* Effect.promise(() =>
          sshRun(
            params.command,
            {
              host: params.host,
              port: params.port ?? 22,
              username: params.username,
              password: params.password,
              privateKey: params.privateKey,
              cwd: params.cwd,
            },
            onData,
          ),
        )

        const output = lines.join("").trim()
        const exitLabel = result.exitCode === 0 ? "exited 0" : `exited ${result.exitCode}`

        return {
          title: `SSH ${params.host}: ${params.command.slice(0, 40)}`,
          metadata: { exitCode: result.exitCode, host: params.host },
          output: output ? `${output}\n[${exitLabel}]` : `[${exitLabel}]`,
        }
      })
    },
  }),
)
