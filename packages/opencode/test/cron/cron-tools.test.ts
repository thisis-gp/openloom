import { describe, it, expect } from "bun:test"

describe("cron-tools exports", () => {
  it("exports CronJobTool as the single merged tool", async () => {
    const mod = await import("../../src/cron/cron-tools")
    expect(mod.CronJobTool).toBeDefined()
  })

  it("does NOT export CronCreateTool, CronListTool, CronDeleteTool", async () => {
    const mod = await import("../../src/cron/cron-tools") as any
    expect(mod.CronCreateTool).toBeUndefined()
    expect(mod.CronListTool).toBeUndefined()
    expect(mod.CronDeleteTool).toBeUndefined()
  })
})
