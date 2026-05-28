import { describe, it, expect, mock, beforeEach } from "bun:test"
import { Dispatcher } from "../../src/orchestrator/dispatcher"
import type { WorkerOutcome } from "../../src/orchestrator/types"

describe("Dispatcher.buildRunSummary", () => {
  it("returns all_done when all outcomes are done", () => {
    const outcomes: WorkerOutcome[] = [
      { taskId: "T-1", title: "Task 1", worker: "claude", model: "sonnet", outcome: "done", startedAt: 0, endedAt: 1000, durationSeconds: 1, summary: "done" },
      { taskId: "T-2", title: "Task 2", worker: "claude", model: "sonnet", outcome: "done", startedAt: 0, endedAt: 2000, durationSeconds: 2, summary: "done" },
    ]
    const result = Dispatcher.buildRunSummary(outcomes)
    expect(result.status).toBe("all_done")
    expect(result.blockedTasks).toHaveLength(0)
  })

  it("returns has_blocked when any outcome is blocked", () => {
    const outcomes: WorkerOutcome[] = [
      { taskId: "T-1", title: "Task 1", worker: "claude", model: "sonnet", outcome: "done", startedAt: 0, endedAt: 1000, durationSeconds: 1, summary: "done" },
      { taskId: "T-2", title: "Task 2", worker: "claude", model: "sonnet", outcome: "blocked", startedAt: 0, endedAt: 2000, durationSeconds: 2, summary: "blocked: missing dep" },
    ]
    const result = Dispatcher.buildRunSummary(outcomes)
    expect(result.status).toBe("has_blocked")
    expect(result.blockedTasks).toContain("T-2")
  })

  it("returns has_blocked when any outcome is timeout", () => {
    const outcomes: WorkerOutcome[] = [
      { taskId: "T-1", title: "Task 1", worker: "claude", model: "sonnet", outcome: "timeout", startedAt: 0, endedAt: 1000, durationSeconds: 1, summary: "timed out" },
    ]
    const result = Dispatcher.buildRunSummary(outcomes)
    expect(result.status).toBe("has_blocked")
  })
})

describe("Dispatcher.formatApprovalSummary", () => {
  it("includes QA pass result", () => {
    const summary = Dispatcher.formatApprovalSummary({
      goal: "Build login",
      workerOutcomes: [],
      qaResult: "pass",
      reviewResult: "pass",
      reviewFindings: [],
    })
    expect(summary).toContain("QA")
    expect(summary).toContain("pass")
  })

  it("includes critical review findings prominently", () => {
    const summary = Dispatcher.formatApprovalSummary({
      goal: "Build login",
      workerOutcomes: [],
      qaResult: "pass",
      reviewResult: "findings",
      reviewFindings: [{ severity: "critical", message: "SQL injection in query builder" }],
    })
    expect(summary).toContain("CRITICAL")
    expect(summary).toContain("SQL injection")
  })
})
