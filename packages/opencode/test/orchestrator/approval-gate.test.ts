import { describe, it, expect } from "bun:test"
import { ApprovalGate } from "../../src/orchestrator/approval-gate"

describe("ApprovalGate.parseQaReport", () => {
  it("parses a passing QA report from comment JSON", () => {
    const comment = JSON.stringify({
      type: "qa_report",
      result: "pass",
      checks: [
        { name: "typecheck", passed: true, output: "" },
        { name: "test", passed: true, output: "20 tests passed" },
      ],
    })
    const result = ApprovalGate.parseQaReport(comment)
    expect(result).not.toBeNull()
    expect(result!.result).toBe("pass")
    expect(result!.checks).toHaveLength(2)
  })

  it("parses a failing QA report", () => {
    const comment = JSON.stringify({
      type: "qa_report",
      result: "fail",
      checks: [{ name: "test", passed: false, output: "3 tests failed" }],
    })
    const result = ApprovalGate.parseQaReport(comment)
    expect(result!.result).toBe("fail")
  })

  it("returns null for non-QA comments", () => {
    const result = ApprovalGate.parseQaReport(JSON.stringify({ type: "worklog" }))
    expect(result).toBeNull()
  })
})

describe("ApprovalGate.parseReviewReport", () => {
  it("parses a passing review report", () => {
    const comment = JSON.stringify({
      type: "review_report",
      result: "pass",
      findings: [],
    })
    const result = ApprovalGate.parseReviewReport(comment)
    expect(result?.result).toBe("pass")
    expect(result?.findings).toHaveLength(0)
  })

  it("parses a review report with findings", () => {
    const comment = JSON.stringify({
      type: "review_report",
      result: "findings",
      findings: [{ severity: "critical", file: "src/auth.ts", message: "SQL injection" }],
    })
    const result = ApprovalGate.parseReviewReport(comment)
    expect(result?.result).toBe("findings")
    expect(result?.findings[0].severity).toBe("critical")
  })

  it("returns null for non-review comments", () => {
    const result = ApprovalGate.parseReviewReport(JSON.stringify({ type: "worklog" }))
    expect(result).toBeNull()
  })
})

describe("ApprovalGate.shouldBlock", () => {
  it("returns false when no critical findings and QA passes", () => {
    expect(ApprovalGate.shouldBlock("pass", [])).toBe(false)
  })

  it("returns true when QA fails", () => {
    expect(ApprovalGate.shouldBlock("fail", [])).toBe(true)
  })

  it("returns true when critical findings exist", () => {
    expect(ApprovalGate.shouldBlock("pass", [{ severity: "critical", file: "x.ts", message: "bad" }])).toBe(true)
  })
})
