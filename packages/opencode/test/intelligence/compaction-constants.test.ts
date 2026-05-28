import { describe, expect, test } from "bun:test"
import {
  COMPACTION_FAILURE_COOLDOWN_MS,
  REFERENCE_ONLY_SUMMARY_PREFIX,
} from "../../src/session/compaction"

describe("intelligence.compaction constants", () => {
  test("reference-only summary prefix marks archived context", () => {
    expect(REFERENCE_ONLY_SUMMARY_PREFIX).toContain("Reference-only")
    expect(REFERENCE_ONLY_SUMMARY_PREFIX).toContain("not an active instruction")
  })

  test("compaction failure cooldown is five minutes", () => {
    expect(COMPACTION_FAILURE_COOLDOWN_MS).toBe(5 * 60 * 1000)
  })
})
