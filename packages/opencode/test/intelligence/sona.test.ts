import { describe, expect, it } from "bun:test"
import { hashToolSequence, extractPattern } from "../../src/intelligence/sona/sona"

describe("hashToolSequence", () => {
  it("produces consistent hash for same sequence", () => {
    const h1 = hashToolSequence(["read", "edit", "shell"])
    const h2 = hashToolSequence(["read", "edit", "shell"])
    expect(h1).toBe(h2)
  })
  it("produces different hash for different sequence", () => {
    const h1 = hashToolSequence(["read", "edit"])
    const h2 = hashToolSequence(["edit", "read"])
    expect(h1).not.toBe(h2)
  })
})

describe("extractPattern", () => {
  it("returns last 5 tools from a long sequence", () => {
    const tools = ["a", "b", "c", "d", "e", "f", "g"]
    expect(extractPattern(tools)).toEqual(["c", "d", "e", "f", "g"])
  })
  it("returns full sequence when <= 5 tools", () => {
    const tools = ["read", "edit"]
    expect(extractPattern(tools)).toEqual(["read", "edit"])
  })
})
