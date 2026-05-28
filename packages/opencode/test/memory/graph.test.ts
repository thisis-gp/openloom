import { Effect, Layer } from "effect"
import { describe, expect } from "bun:test"
import { extractEntities } from "@/memory/graph/extractor"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

describe("memory.graph.extractor", () => {
  it.effect("extracts file path entities from text", () =>
    Effect.gen(function* () {
      const text = "We modified src/session/session.ts to add the parent_id column."
      const result = extractEntities(text)
      const fileEntities = result.entities.filter((e) => e.type === "file")
      expect(fileEntities.length).toBeGreaterThan(0)
      expect(fileEntities.some((e) => e.label.includes("session.ts"))).toBe(true)
    }),
  )

  it.effect("extracts decision entities from text", () =>
    Effect.gen(function* () {
      const text = "We decided to use SQLite for the memory system instead of PostgreSQL."
      const result = extractEntities(text)
      const decisions = result.entities.filter((e) => e.type === "decision")
      expect(decisions.length).toBeGreaterThan(0)
    }),
  )

  it.effect("returns empty arrays for short unstructured text", () =>
    Effect.gen(function* () {
      const result = extractEntities("ok")
      expect(result.entities.length).toBe(0)
    }),
  )
})
