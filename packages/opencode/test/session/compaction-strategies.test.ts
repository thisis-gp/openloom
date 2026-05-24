import { describe, expect, it } from "bun:test"
import { selectStrategy, abstractStrategy, detailPruneStrategy, reasoningAwareStrategy } from "../../src/session/compaction-strategies"

describe("selectStrategy", () => {
  it("returns abstract for overflow >= 2x prune minimum", () => {
    expect(selectStrategy(80_000, 20_000)).toBe("abstract")
  })
  it("returns detail-prune for overflow < 2x prune minimum", () => {
    expect(selectStrategy(35_000, 20_000)).toBe("detail-prune")
  })
  it("returns reasoning-aware when overflow > prune minimum and has reasoning", () => {
    expect(selectStrategy(25_000, 20_000, true)).toBe("reasoning-aware")
  })
  it("returns abstract (not reasoning-aware) when overflow >= 2x AND hasReasoning=true", () => {
    expect(selectStrategy(80_000, 20_000, true)).toBe("abstract")
  })
})

describe("abstractStrategy", () => {
  it("returns a system prompt instructing maximum compression", () => {
    const prompt = abstractStrategy("prior summary", 80_000)
    expect(prompt).toContain("abstract")
    expect(prompt).toContain("80000")
  })
})

describe("detailPruneStrategy", () => {
  it("instructs preserving decisions and removing implementation details", () => {
    const prompt = detailPruneStrategy("prior summary")
    expect(prompt).toContain("decision")
    expect(prompt).toContain("implementation detail")
  })
})

describe("reasoningAwareStrategy", () => {
  it("instructs preserving reasoning chains", () => {
    const prompt = reasoningAwareStrategy("prior summary")
    expect(prompt).toContain("reasoning")
    expect(prompt).toContain("chain")
  })
})
