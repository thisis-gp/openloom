import { describe, it, expect } from "bun:test"
import { CuratorJob } from "../../src/cron/curator"
import type { RunSignal } from "../../src/orchestrator/types"

const makeSignal = (overrides: Partial<RunSignal> = {}): RunSignal => ({
  runId: "run-1",
  project: "openloom",
  goal: "Build login feature",
  startedAt: Date.now() - 3600_000,
  endedAt: Date.now(),
  totalDurationSeconds: 3600,
  tasks: [],
  workerOutcomes: [],
  qaResult: "pass",
  reviewResult: "pass",
  reviewFindings: [],
  userDecision: "approved",
  rejectionCount: 0,
  rejectionFeedback: [],
  ...overrides,
})

describe("CuratorJob.shouldRunNow", () => {
  it("returns true when last run was more than 7 days ago", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    expect(CuratorJob.shouldRunNow(eightDaysAgo)).toBe(true)
  })

  it("returns false when last run was 3 days ago", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
    expect(CuratorJob.shouldRunNow(threeDaysAgo)).toBe(false)
  })

  it("returns true when last run is null (never run)", () => {
    expect(CuratorJob.shouldRunNow(null)).toBe(true)
  })
})

describe("CuratorJob.buildCuratorPrompt", () => {
  it("includes signal summaries in the prompt", () => {
    const signals = [
      makeSignal({ goal: "Build login feature", rejectionCount: 0 }),
      makeSignal({ goal: "Add tests", rejectionCount: 2, userDecision: "approved" }),
    ]
    const prompt = CuratorJob.buildCuratorPrompt(signals, "openloom")
    expect(prompt).toContain("Build login feature")
    expect(prompt).toContain("Add tests")
    expect(prompt).toContain("openloom")
  })

  it("highlights repeated rejections in the prompt", () => {
    const signals = [
      makeSignal({ goal: "Refactor auth", rejectionCount: 3, userDecision: "approved" }),
    ]
    const prompt = CuratorJob.buildCuratorPrompt(signals, "openloom")
    expect(prompt).toContain("rejection")
  })

  it("includes skill writing instructions", () => {
    const prompt = CuratorJob.buildCuratorPrompt([makeSignal()], "openloom")
    expect(prompt).toContain("~/.agents/skills")
    expect(prompt).toContain(".agents/skills")
  })
})

describe("CuratorJob.classifySkillScope", () => {
  it("classifies a general pattern as global", () => {
    const scope = CuratorJob.classifySkillScope(
      "Always run typecheck before committing",
      "openloom",
    )
    expect(scope).toBe("global")
  })

  it("classifies a project-specific pattern as project", () => {
    const scope = CuratorJob.classifySkillScope(
      "OpenLoom uses Effect-ts services and bun:test for all new code",
      "openloom",
    )
    expect(scope).toBe("project")
  })
})
