import * as Log from "@openloom/core/util/log"
import { homedir } from "os"
import { join } from "path"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import type { RunSignal } from "../orchestrator/types"

const log = Log.create({ service: "cron.curator" })

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const STATE_FILE = join(homedir(), ".agents", "curator-state.json")

interface CuratorState {
  lastRunAt: number | null
  lastRunSummary: string | null
  runCount: number
}

export class CuratorJob {
  static readState(): CuratorState {
    if (!existsSync(STATE_FILE)) {
      return { lastRunAt: null, lastRunSummary: null, runCount: 0 }
    }
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CuratorState
    } catch {
      return { lastRunAt: null, lastRunSummary: null, runCount: 0 }
    }
  }

  static writeState(state: CuratorState): void {
    mkdirSync(join(homedir(), ".agents"), { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8")
  }

  static shouldRunNow(lastRunAt: number | null): boolean {
    if (lastRunAt === null) return true
    return Date.now() - lastRunAt >= SEVEN_DAYS_MS
  }

  static buildCuratorPrompt(signals: RunSignal[], project: string): string {
    const signalLines = signals.map(s => {
      const rejectionNote = s.rejectionCount > 0
        ? ` (rejected ${s.rejectionCount} time${s.rejectionCount > 1 ? "s" : ""} before approval)`
        : ""
      const feedback = s.rejectionFeedback.length > 0
        ? `\n  Feedback given: ${s.rejectionFeedback.join("; ")}`
        : ""
      return `- Goal: "${s.goal}" | QA: ${s.qaResult} | Review: ${s.reviewResult} | Decision: ${s.userDecision}${rejectionNote}${feedback}`
    }).join("\n")

    return `You are the OpenLoom Curator. Review the past week of agent runs for project "${project}" and identify patterns worth encoding as skills.

## Runs This Week

${signalLines}

## Your Task

1. Identify patterns across these runs — recurring failures, repeated rejection reasons, techniques that worked well, workflow improvements.

2. For each pattern worth encoding, decide the scope:
   - **Global skill** → goes to \`~/.agents/skills/<name>/SKILL.md\` — use when the lesson applies to any project
   - **Project skill** → goes to \`${project}/.agents/skills/<name>/SKILL.md\` — use when the lesson is specific to this project's stack, conventions, or codebase

3. For each skill:
   - Choose a class-level name (e.g. "typescript-testing-patterns", not "fix-login-bug-2026-05-28")
   - Write a SKILL.md with frontmatter: name, description, scope (global|project), created_by: curator, created_at: <today>
   - Body: clear guidance a future agent can follow, including any pitfalls discovered

4. Write each skill using the shell tool:
   \`\`\`
   mkdir -p <skill-dir>/<name>
   cat > <skill-dir>/<name>/SKILL.md << 'EOF'
   ---
   name: <name>
   description: <one line>
   scope: <global|project>
   created_by: curator
   created_at: <ISO date>
   ---

   <skill body>
   EOF
   \`\`\`

5. When done, output a summary:
   "Curator complete: <N> skills created, <N> updated. Skills: <comma-separated names>"

## Rules

- Only create class-level skills. No "fix-X-today" names.
- If an existing skill covers the topic, update it instead of creating a new one.
- A pass with no new patterns is valid — say "No new patterns found."
- Never create skills about environment failures (missing binaries, wrong paths).
`
  }

  static classifySkillScope(description: string, project: string): "global" | "project" {
    const lower = description.toLowerCase()
    if (lower.includes(project.toLowerCase())) return "project"
    if (lower.includes("effect-ts") || lower.includes("bun:test") || lower.includes("openloom")) return "project"
    return "global"
  }

  static CURATOR_CRON_JOB_NAME = "__openloom_curator__"
  static CURATOR_SCHEDULE = "0 9 * * 1"
}

void log
