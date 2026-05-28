import { describe, it, expect } from "bun:test"
import { buildWorkerPrompt, SLATE_CLI } from "../../src/subagent/delegate"

// Stubs — real assertions added in later tasks
describe("claude-cli model flag", () => {
  it("compiles and exports runClaudeCli", async () => {
    const mod = await import("../../src/subagent/backends/claude-cli")
    expect(typeof mod.runClaudeCli).toBe("function")
  })
})

describe("codex model flag", () => {
  it("compiles and exports runCodex", async () => {
    const mod = await import("../../src/subagent/backends/codex")
    expect(typeof mod.runCodex).toBe("function")
  })
})

describe("buildWorkerPrompt", () => {
  it("returns plain goal when no task_id provided", () => {
    const result = buildWorkerPrompt("Fix the login bug", undefined, "claude-worker")
    expect(result).toBe("Fix the login bug")
  })

  it("injects slate CLI commands when task_id is provided", () => {
    const result = buildWorkerPrompt("Fix the login bug", "abc-123", "claude-worker")
    expect(result).toContain("abc-123")
    expect(result).toContain("slate task move")
    expect(result).toContain("slate run log")
    expect(result).toContain("in_progress")
    expect(result).toContain("done")
  })

  it("uses the provided agent name in --by flag", () => {
    const result = buildWorkerPrompt("Fix the login bug", "abc-123", "codex-worker")
    expect(result).toContain("--by codex-worker")
  })
})

describe("SLATE_CLI", () => {
  it("is a non-empty string", () => {
    expect(typeof SLATE_CLI).toBe("string")
    expect(SLATE_CLI.length).toBeGreaterThan(0)
  })
})
