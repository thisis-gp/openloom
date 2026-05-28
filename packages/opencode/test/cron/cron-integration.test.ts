import { describe, expect, test } from "bun:test"
import { computeNextRun } from "../../src/cron/cron"
import { SUBAGENT_BLOCKED_TOOLS } from "../../src/tool/task"

describe("cron.integration", () => {
  test("computeNextRun parses every N minutes", () => {
    const next = computeNextRun("every 5 minutes")
    expect(next).toBeDefined()
    if (!next) return
    expect(next).toBeGreaterThan(Date.now())
    expect(next - Date.now()).toBeLessThan(6 * 60 * 1000)
  })

  test("cron child sessions block delegation and cron mutation tools", () => {
    expect(SUBAGENT_BLOCKED_TOOLS).toContain("cron_create")
    expect(SUBAGENT_BLOCKED_TOOLS).toContain("cron_delete")
    expect(SUBAGENT_BLOCKED_TOOLS).toContain("delegate_task")
  })
})
