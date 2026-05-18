import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const GLOBAL_MEMORY_DIR = path.join(os.homedir(), ".agents", "memory")
const MEMORY_FILE = "progress.md"
const MEMORY_HEADER = "# Session Memory\n\n| Date | Session | Title |\n|------|---------|-------|\n"

export async function writeSessionMemory(input: {
  sessionID: string
  title: string | undefined
  cwd: string
}): Promise<void> {
  try {
    const date = new Date().toISOString().slice(0, 10)
    const shortID = input.sessionID.slice(0, 8)
    const title = (input.title ?? "untitled").replace(/\|/g, "-").trim().slice(0, 60)
    const entry = `| ${date} | ${shortID} | ${title} |\n`

    // Prefer project-local .agents/memory/ if it already exists, else use global
    const localDir = path.join(input.cwd, ".agents", "memory")
    const memDir = fs.existsSync(localDir) ? localDir : GLOBAL_MEMORY_DIR
    const memFile = path.join(memDir, MEMORY_FILE)

    if (!fs.existsSync(memDir)) {
      fs.mkdirSync(memDir, { recursive: true })
    }
    if (!fs.existsSync(memFile)) {
      fs.writeFileSync(memFile, MEMORY_HEADER, "utf-8")
    }
    fs.appendFileSync(memFile, entry, "utf-8")
  } catch {
    // non-fatal
  }
}
