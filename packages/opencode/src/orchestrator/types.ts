export interface WorkerOutcome {
  taskId: string
  title: string
  worker: "claude" | "codex" | "cursor" | "build"
  model: string
  outcome: "done" | "blocked" | "timeout"
  startedAt: number
  endedAt: number
  durationSeconds: number
  summary: string
}

export interface RunSignal {
  runId: string
  project: string
  goal: string
  startedAt: number
  endedAt: number
  totalDurationSeconds: number
  tasks: Array<{
    id: string
    title: string
    worker: string
    model: string
  }>
  workerOutcomes: WorkerOutcome[]
  qaResult: "pass" | "fail" | "skipped"
  reviewResult: "pass" | "findings" | "skipped"
  reviewFindings: Array<{ severity: "critical" | "warning" | "info"; message: string }>
  userDecision: "approved" | "rejected" | "pending"
  rejectionCount: number
  rejectionFeedback: string[]
}

export interface WorklogEntry {
  agent: string
  startedAt: string   // ISO string
  endedAt: string     // ISO string
  durationSeconds: number
  summary: string
  outcome: "done" | "blocked"
}
