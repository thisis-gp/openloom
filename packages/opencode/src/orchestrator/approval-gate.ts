import { Dispatcher } from "./dispatcher"
import type { WorkerOutcome } from "./types"

export interface QaReport {
  result: "pass" | "fail"
  checks: Array<{ name: string; passed: boolean; output: string }>
}

export interface ReviewFinding {
  severity: "critical" | "warning" | "info"
  file: string
  message: string
}

export interface ReviewReport {
  result: "pass" | "findings"
  findings: ReviewFinding[]
}

export class ApprovalGate {
  static parseQaReport(commentJson: string): QaReport | null {
    try {
      const parsed = JSON.parse(commentJson)
      if (parsed?.type !== "qa_report") return null
      return { result: parsed.result, checks: parsed.checks ?? [] }
    } catch {
      return null
    }
  }

  static parseReviewReport(commentJson: string): ReviewReport | null {
    try {
      const parsed = JSON.parse(commentJson)
      if (parsed?.type !== "review_report") return null
      return { result: parsed.result, findings: parsed.findings ?? [] }
    } catch {
      return null
    }
  }

  static shouldBlock(qaResult: "pass" | "fail" | "skipped", findings: ReviewFinding[]): boolean {
    if (qaResult === "fail") return true
    return findings.some(f => f.severity === "critical")
  }

  static buildUserMessage(
    goal: string,
    workerOutcomes: WorkerOutcome[],
    qa: QaReport | null,
    review: ReviewReport | null,
    rejectionCount: number,
  ): string {
    const qaResult = qa?.result ?? "skipped"
    const reviewFindings = review?.findings ?? []
    const reviewResult: "pass" | "findings" | "skipped" = review
      ? reviewFindings.length > 0 ? "findings" : "pass"
      : "skipped"

    const base = Dispatcher.formatApprovalSummary({
      goal,
      workerOutcomes,
      qaResult,
      reviewResult,
      reviewFindings,
    })

    if (rejectionCount >= 3) {
      return base + "\n\n> ⚠️ This run has been rejected 3 times. Consider breaking the goal into smaller tasks."
    }

    return base
  }

  static getReportsFromSlate(projectId: string): { qa: QaReport | null; review: ReviewReport | null } {
    const raw = Dispatcher.runSlateCommand(`project comments ${projectId} --format json`)
    if (!raw) return { qa: null, review: null }

    let comments: string[] = []
    try {
      comments = (JSON.parse(raw) as Array<{ body: string }>).map(c => c.body)
    } catch {
      return { qa: null, review: null }
    }

    let qa: QaReport | null = null
    let review: ReviewReport | null = null

    for (const body of comments) {
      if (!qa) qa = ApprovalGate.parseQaReport(body)
      if (!review) review = ApprovalGate.parseReviewReport(body)
    }

    return { qa, review }
  }
}
