import { describe, it, expect } from "bun:test"
import { buildWorkerPrompt, SLATE_CLI } from "../../src/subagent/delegate"
import { dropCursorTask } from "../../src/subagent/backends/cursor"
import { claudeCliAvailable, runClaudeCli } from "../../src/subagent/backends/claude-cli"
import { readFileSync, existsSync } from "fs"

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

describe("buildWorkerPrompt blockNote passthrough", () => {
  it("buildWorkerPrompt does not include blockNote (that is added by buildFinalPrompt)", () => {
    const result = buildWorkerPrompt("Fix bug", "t-1", "claude-worker")
    expect(result).not.toContain("Subagent tool restrictions")
  })
})

describe("dropCursorTask", () => {
  it("creates a task file containing the goal", async () => {
    const { taskFile } = await dropCursorTask("Implement login form", {})
    expect(existsSync(taskFile)).toBe(true)
    const content = readFileSync(taskFile, "utf8")
    expect(content).toContain("Implement login form")
  })

  it("accepts taskId in opts without error", async () => {
    const { taskFile } = await dropCursorTask("Fix auth bug", { taskId: "slate-xyz-123" })
    expect(existsSync(taskFile)).toBe(true)
    const content = readFileSync(taskFile, "utf8")
    expect(content).toContain("Fix auth bug")
  })

  it("embeds goal verbatim including any Slate CLI instructions", async () => {
    const goalWithSlate = "Fix auth bug\n---\nSLATE TASK TRACKING (task_id: abc-123):\nuv run slate task move abc-123 in_progress"
    const { taskFile } = await dropCursorTask(goalWithSlate, { taskId: "abc-123" })
    const content = readFileSync(taskFile, "utf8")
    expect(content).toContain("slate task move abc-123 in_progress")
  })
})

describe("claude-cli integration smoke", () => {
  it("passes --model flag and gets a response (skipped if claude not in PATH)", async () => {
    const available = await claudeCliAvailable()
    if (!available) {
      console.log("  [SKIP] claude not in PATH")
      return
    }
    const result = await runClaudeCli("Reply with exactly the word: SMOKE_OK", {
      model: "claude-haiku-4-5",
      maxTurns: 3,
      timeout: 60_000,
    })
    expect(result.output).toContain("SMOKE_OK")
    expect(result.exitCode).toBe(0)
  }, { timeout: 90_000 })
})

describe("buildWorkerPrompt uses SLATE_CLI constant", () => {
  it("injected slate CLI commands reference the SLATE_CLI path", () => {
    const prompt = buildWorkerPrompt("Do something", "task-abc-123", "claude-worker")
    expect(prompt).toContain(SLATE_CLI)
    expect(prompt).toContain("task-abc-123")
    expect(prompt).toContain("in_progress")
    expect(prompt).toContain("done")
  })
})

describe("buildWorkerPrompt worklog injection", () => {
  it("includes worklog instructions when task_id is provided", () => {
    const result = buildWorkerPrompt("Fix login bug", "TASK-42", "claude-worker")
    expect(result).toContain("WORKLOG")
    expect(result).toContain("started_at")
    expect(result).toContain("ended_at")
    expect(result).toContain("summary")
  })

  it("worklog instructions reference the correct task_id", () => {
    const result = buildWorkerPrompt("Fix login bug", "TASK-42", "claude-worker")
    expect(result).toContain("TASK-42")
  })

  it("does not include worklog when no task_id", () => {
    const result = buildWorkerPrompt("Fix login bug", undefined, "claude-worker")
    expect(result).not.toContain("WORKLOG")
    expect(result).toBe("Fix login bug")
  })
})
