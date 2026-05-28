import { execSync } from "child_process"
import * as Log from "@openloom/core/util/log"
import type { WorkerOutcome } from "./types"

const log = Log.create({ service: "orchestrator.dispatcher" })

export interface RunSummary {
  status: "all_done" | "has_blocked"
  blockedTasks: string[]
}

export interface ApprovalSummaryInput {
  goal: string
  workerOutcomes: WorkerOutcome[]
  qaResult: "pass" | "fail" | "skipped"
  reviewResult: "pass" | "findings" | "skipped"
  reviewFindings: Array<{ severity: "critical" | "warning" | "info"; message: string }>
}

export class Dispatcher {
  static buildRunSummary(outcomes: WorkerOutcome[]): RunSummary {
    const blocked = outcomes.filter(o => o.outcome === "blocked" || o.outcome === "timeout")
    return {
      status: blocked.length > 0 ? "has_blocked" : "all_done",
      blockedTasks: blocked.map(o => o.taskId),
    }
  }

  static formatApprovalSummary(input: ApprovalSummaryInput): string {
    const lines: string[] = [
      `## Run Complete: ${input.goal}`,
      "",
      `**Workers:** ${input.workerOutcomes.length} tasks completed`,
      `**QA:** ${input.qaResult}`,
      `**Review:** ${input.reviewResult}`,
    ]

    const critical = input.reviewFindings.filter(f => f.severity === "critical")
    const warnings = input.reviewFindings.filter(f => f.severity === "warning")

    if (critical.length > 0) {
      lines.push("", "### CRITICAL FINDINGS (must fix before approving)")
      for (const f of critical) lines.push(`- ${f.message}`)
    }

    if (warnings.length > 0) {
      lines.push("", "### Warnings")
      for (const f of warnings) lines.push(`- ${f.message}`)
    }

    lines.push("", "**Approve this run or provide feedback for another cycle?**")
    return lines.join("\n")
  }

  static runSlateCommand(args: string): string {
    try {
      return execSync(`slate ${args}`, { encoding: "utf8", timeout: 10_000 }).trim()
    } catch (err: any) {
      log.warn("slate command failed", { args, error: err?.message })
      return ""
    }
  }

  static getTaskState(taskId: string): string {
    const out = Dispatcher.runSlateCommand(`task show ${taskId} --format json`)
    if (!out) return "unknown"
    try {
      return (JSON.parse(out) as { state: string }).state ?? "unknown"
    } catch {
      return "unknown"
    }
  }

  static async pollUntilDone(
    taskId: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<"done" | "blocked" | "timeout"> {
    const timeout = opts.timeoutMs ?? 30 * 60 * 1000
    const interval = opts.intervalMs ?? 10_000
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      const state = Dispatcher.getTaskState(taskId)
      if (state === "done") return "done"
      if (state === "blocked" || state === "cancelled") return "blocked"
      await new Promise(r => setTimeout(r, interval))
    }

    return "timeout"
  }
}
