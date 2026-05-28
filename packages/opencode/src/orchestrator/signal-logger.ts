import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { RunSignal } from "./types"

const DEFAULT_SIGNALS_DIR = join(homedir(), ".agents", "signals")

export class SignalLogger {
  constructor(private readonly baseDir: string = DEFAULT_SIGNALS_DIR) {}

  write(signal: RunSignal): string {
    const projectDir = join(this.baseDir, signal.project)
    mkdirSync(projectDir, { recursive: true })

    const date = new Date(signal.startedAt).toISOString().slice(0, 10)
    const fileName = `${date}-${signal.runId}.json`
    const filePath = join(projectDir, fileName)

    writeFileSync(filePath, JSON.stringify(signal, null, 2), "utf8")
    return filePath
  }

  readAll(project: string): RunSignal[] {
    const projectDir = join(this.baseDir, project)
    if (!existsSync(projectDir)) return []

    return readdirSync(projectDir)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(projectDir, f), "utf8")) as RunSignal
        } catch {
          return null
        }
      })
      .filter((s): s is RunSignal => s !== null)
  }

  readSince(project: string, sinceTimestamp: number): RunSignal[] {
    return this.readAll(project).filter(s => s.startedAt >= sinceTimestamp)
  }
}
