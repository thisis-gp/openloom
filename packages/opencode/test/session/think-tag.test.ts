import { describe, expect, it } from "bun:test"
import { ThinkTagParser } from "../../src/session/think-tag"

describe("ThinkTagParser", () => {
  it("emits reasoning parts for <think>...</think> content", () => {
    const parser = new ThinkTagParser()
    const events: { type: string; text: string }[] = []
    parser.on("reasoning-start", () => events.push({ type: "reasoning-start", text: "" }))
    parser.on("reasoning-delta", (text: string) => events.push({ type: "reasoning-delta", text }))
    parser.on("reasoning-end", () => events.push({ type: "reasoning-end", text: "" }))
    parser.on("text-delta", (text: string) => events.push({ type: "text-delta", text }))

    parser.feed("<think>step one</think>answer here")

    expect(events[0].type).toBe("reasoning-start")
    expect(events[1]).toEqual({ type: "reasoning-delta", text: "step one" })
    expect(events[2].type).toBe("reasoning-end")
    expect(events[3]).toEqual({ type: "text-delta", text: "answer here" })
  })

  it("handles incremental chunks that split the tag boundary", () => {
    const parser = new ThinkTagParser()
    const textParts: string[] = []
    const reasoningParts: string[] = []
    parser.on("text-delta", (t: string) => textParts.push(t))
    parser.on("reasoning-delta", (t: string) => reasoningParts.push(t))

    parser.feed("<thi")
    parser.feed("nk>re")
    parser.feed("ason")
    parser.feed("</think>fin")

    expect(reasoningParts.join("")).toBe("reason")
    expect(textParts.join("")).toBe("fin")
  })

  it("passes through text unchanged when no think tags present", () => {
    const parser = new ThinkTagParser()
    const textParts: string[] = []
    parser.on("text-delta", (t: string) => textParts.push(t))
    parser.feed("plain text delta")
    expect(textParts).toEqual(["plain text delta"])
  })

  it("flush() while inThink=true emits reasoning-delta and reasoning-end (not text-delta)", () => {
    const parser = new ThinkTagParser()
    const events: { type: string; text: string }[] = []
    parser.on("reasoning-start", () => events.push({ type: "reasoning-start", text: "" }))
    parser.on("reasoning-delta", (t: string) => events.push({ type: "reasoning-delta", text: t }))
    parser.on("reasoning-end", () => events.push({ type: "reasoning-end", text: "" }))
    parser.on("text-delta", (t: string) => events.push({ type: "text-delta", text: t }))

    parser.feed("<think>incomplete reasoning")
    parser.flush()

    expect(events.find(e => e.type === "reasoning-delta")?.text).toBe("incomplete reasoning")
    expect(events.some(e => e.type === "reasoning-end")).toBe(true)
    expect(events.some(e => e.type === "text-delta")).toBe(false)
  })

  it("handles empty <think></think> tag", () => {
    const parser = new ThinkTagParser()
    const reasoningParts: string[] = []
    const textParts: string[] = []
    parser.on("reasoning-delta", (t: string) => reasoningParts.push(t))
    parser.on("text-delta", (t: string) => textParts.push(t))

    parser.feed("<think></think>after")

    expect(reasoningParts.join("")).toBe("")
    expect(textParts.join("")).toBe("after")
  })
})
