import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SignalLogger } from "../../src/orchestrator/signal-logger"
import type { RunSignal } from "../../src/orchestrator/types"

const TEST_HOME = join(tmpdir(), `signal-logger-test-${Date.now()}`)

const makeSignal = (overrides: Partial<RunSignal> = {}): RunSignal => ({
  runId: "test-run-123",
  project: "openloom",
  goal: "Build login feature",
  startedAt: 1748000000000,
  endedAt: 1748000840000,
  totalDurationSeconds: 840,
  tasks: [{ id: "TASK-1", title: "Implement login", worker: "claude", model: "sonnet" }],
  workerOutcomes: [],
  qaResult: "pass",
  reviewResult: "pass",
  reviewFindings: [],
  userDecision: "approved",
  rejectionCount: 0,
  rejectionFeedback: [],
  ...overrides,
})

describe("SignalLogger", () => {
  let logger: SignalLogger

  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true })
    logger = new SignalLogger(TEST_HOME)
  })

  afterEach(() => {
    rmSync(TEST_HOME, { recursive: true, force: true })
  })

  it("writes signal file to correct path", () => {
    const signal = makeSignal()
    const filePath = logger.write(signal)
    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toContain("openloom")
    expect(filePath).toContain("test-run-123")
  })

  it("written file contains valid JSON matching signal", () => {
    const signal = makeSignal()
    const filePath = logger.write(signal)
    const parsed = JSON.parse(readFileSync(filePath, "utf8"))
    expect(parsed.runId).toBe("test-run-123")
    expect(parsed.goal).toBe("Build login feature")
    expect(parsed.qaResult).toBe("pass")
  })

  it("reads all signals for a project", () => {
    logger.write(makeSignal({ runId: "run-a" }))
    logger.write(makeSignal({ runId: "run-b" }))
    const signals = logger.readAll("openloom")
    expect(signals.length).toBe(2)
    expect(signals.map(s => s.runId).sort()).toEqual(["run-a", "run-b"])
  })

  it("reads signals since a given timestamp", () => {
    logger.write(makeSignal({ runId: "old", startedAt: 1700000000000 }))
    logger.write(makeSignal({ runId: "recent", startedAt: 1748000000000 }))
    const since = logger.readSince("openloom", 1740000000000)
    expect(since.length).toBe(1)
    expect(since[0].runId).toBe("recent")
  })

  it("creates project directory if it does not exist", () => {
    const signal = makeSignal({ project: "new-project" })
    logger.write(signal)
    expect(existsSync(join(TEST_HOME, "new-project"))).toBe(true)
  })
})
