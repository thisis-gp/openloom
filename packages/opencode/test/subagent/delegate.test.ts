import { describe, it, expect } from "bun:test"

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
