import { spawn } from "child_process"
import type { ExternalAgentResult } from "./codex"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.claude-cli" })

export async function runClaudeCli(
  goal: string,
  opts: { cwd?: string; maxTurns?: number; timeout?: number } = {},
): Promise<ExternalAgentResult> {
  const bin = await findClaudeBin()
  if (!bin) {
    return {
      output: "Claude CLI not found. Ensure 'claude' is in PATH.",
      exitCode: 1,
    }
  }

  const args: string[] = [
    "--print",
    "--output-format", "text",
    "--max-turns", String(opts.maxTurns ?? 10),
    "-p", goal,
  ]

  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 10 * 60 * 1000

  log.info("claude -p", { cwd, goal: goal.slice(0, 80) })

  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.stderr.on("data", (c: Buffer) => chunks.push(c.toString()))

    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      chunks.push("\n[Claude CLI: timed out]")
    }, timeout)

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ output: chunks.join(""), exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ output: `Claude CLI spawn error: ${err.message}`, exitCode: 1 })
    })
  })
}

export async function claudeCliAvailable(): Promise<boolean> {
  return !!(await findClaudeBin())
}

async function findClaudeBin(): Promise<string | null> {
  // Try known install paths first
  const candidates = [
    process.platform === "win32"
      ? `${process.env.USERPROFILE}\\.local\\bin\\claude.cmd`
      : `${process.env.HOME}/.local/bin/claude`,
  ]

  for (const p of candidates) {
    try {
      const { existsSync } = await import("fs")
      if (existsSync(p)) return p
    } catch {}
  }

  // Fall back to PATH lookup
  return new Promise((resolve) => {
    const which = process.platform === "win32" ? "where" : "which"
    const proc = spawn(which, ["claude"], { stdio: ["ignore", "pipe", "ignore"] })
    const chunks: string[] = []
    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null)
      resolve(chunks.join("").split("\n")[0]?.trim() ?? null)
    })
    proc.on("error", () => resolve(null))
  })
}
