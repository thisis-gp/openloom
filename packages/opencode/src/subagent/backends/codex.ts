import { spawn } from "child_process"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.codex" })

export type ExternalAgentResult = {
  output: string
  exitCode: number
}

export async function runCodex(
  goal: string,
  opts: { cwd?: string; timeout?: number; model?: string } = {},
): Promise<ExternalAgentResult> {
  const bin = await findBin("codex")
  if (!bin) {
    return {
      output: "Codex CLI not found. Install: npm install -g @openai/codex && codex login",
      exitCode: 1,
    }
  }

  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 5 * 60 * 1000
  const args = ["exec", "--quiet", ...(opts.model ? ["--model", opts.model] : []), "-"]

  log.info("codex exec", { cwd, goal: goal.slice(0, 80), ...(opts.model && { model: opts.model }) })

  return spawnWithTimeout(bin, args, { cwd, stdin: goal, timeout })
}

export async function codexAvailable(): Promise<boolean> {
  return !!(await findBin("codex"))
}

async function findBin(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const which = process.platform === "win32" ? "where" : "which"
    const proc = spawn(which, [name], { stdio: ["ignore", "pipe", "ignore"] })
    const chunks: string[] = []
    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null)
      resolve(chunks.join("").split("\n")[0]?.trim() ?? null)
    })
    proc.on("error", () => resolve(null))
  })
}

function spawnWithTimeout(
  bin: string,
  args: string[],
  opts: { cwd: string; stdin: string; timeout: number },
): Promise<ExternalAgentResult> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc = spawn(bin, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdin.write(opts.stdin)
    proc.stdin.end()

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.stderr.on("data", (c: Buffer) => chunks.push(c.toString()))

    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      chunks.push("\n[timed out]")
    }, opts.timeout)

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ output: chunks.join(""), exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ output: `Spawn error: ${err.message}`, exitCode: 1 })
    })
  })
}
