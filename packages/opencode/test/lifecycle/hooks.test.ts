import { describe, expect, it } from "bun:test"
import { LifecycleEvent, isLifecycleEventType } from "../../src/lifecycle/events"

describe("LifecycleEvent types", () => {
  it("defines session events", () => {
    expect(LifecycleEvent.SessionStarted.type).toBe("lifecycle.session.started")
    expect(LifecycleEvent.SessionEnded.type).toBe("lifecycle.session.ended")
  })
  it("defines tool events", () => {
    expect(LifecycleEvent.ToolBefore.type).toBe("lifecycle.tool.before")
    expect(LifecycleEvent.ToolAfter.type).toBe("lifecycle.tool.after")
  })
  it("defines message events", () => {
    expect(LifecycleEvent.MessageStarted.type).toBe("lifecycle.message.started")
    expect(LifecycleEvent.MessageCompleted.type).toBe("lifecycle.message.completed")
  })
  it("defines compaction events", () => {
    expect(LifecycleEvent.CompactionBefore.type).toBe("lifecycle.compaction.before")
    expect(LifecycleEvent.CompactionAfter.type).toBe("lifecycle.compaction.after")
  })
  it("isLifecycleEventType recognizes valid types", () => {
    expect(isLifecycleEventType("lifecycle.session.started")).toBe(true)
    expect(isLifecycleEventType("session.compacted")).toBe(false)
  })
  it("defines agent events", () => {
    expect(LifecycleEvent.AgentStarted.type).toBe("lifecycle.agent.started")
    expect(LifecycleEvent.AgentCompleted.type).toBe("lifecycle.agent.completed")
  })
  it("defines provider events", () => {
    expect(LifecycleEvent.ProviderSelected.type).toBe("lifecycle.provider.selected")
  })
})
