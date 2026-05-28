import { describe, expect, test } from "bun:test"
import { computeNextRun } from "@/cron/cron"

describe("CronService.computeNextRun", () => {
  test("returns a future timestamp for every 30m", () => {
    const next = computeNextRun("every 30m")
    expect(next).toBeDefined()
    expect(next!).toBeGreaterThan(Date.now())
  })

  test("returns a future timestamp for a standard cron expression", () => {
    const next = computeNextRun("0 9 * * *")
    expect(next).toBeDefined()
    expect(next!).toBeGreaterThan(Date.now())
  })

  test("returns undefined for an invalid schedule", () => {
    expect(computeNextRun("not-a-schedule")).toBeUndefined()
  })
})
