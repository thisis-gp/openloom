import { spawn } from "child_process"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "shell.docker" })

export type DockerRunOptions = {
  image: string
  workdir?: string
  env?: Record<string, string>
  mountCwd?: boolean
}

/**
 * Spawn a command inside an ephemeral Docker container (auto-removed on exit).
 */
export async function dockerRun(
  cmd: string[],
  opts: DockerRunOptions,
  onData: (chunk: string) => void,
): Promise<{ exitCode: number }> {
  const args: string[] = ["run", "--rm", "--init"]

  if (opts.workdir) {
    args.push("-w", opts.workdir)
  }

  if (opts.mountCwd) {
    const cwd = process.cwd()
    args.push("-v", `${cwd}:${opts.workdir ?? "/workspace"}`)
  }

  for (const [k, v] of Object.entries(opts.env ?? {})) {
    args.push("-e", `${k}=${v}`)
  }

  args.push(opts.image, ...cmd)

  log.info("docker run", { image: opts.image, cmd })

  return new Promise((resolve) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] })

    proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()))
    proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()))

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      onData(`Docker error: ${err.message}\n`)
      resolve({ exitCode: 1 })
    })
  })
}

/** Returns true if Docker daemon is reachable. */
export async function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["info"], { stdio: "ignore" })
    proc.on("close", (code) => resolve(code === 0))
    proc.on("error", () => resolve(false))
  })
}
