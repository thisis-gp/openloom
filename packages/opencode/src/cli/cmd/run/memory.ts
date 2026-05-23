import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import type { SessionID } from "@/session/schema"

const GLOBAL_MEMORY_DIR = path.join(os.homedir(), ".agents", "memory")
const MEMORY_FILE = "progress.md"
const MEMORY_HEADER = "# Session Memory\n\n| Date | Session | Title |\n|------|---------|-------|\n"

export async function writeSessionMemory(input: {
  sessionID: string
  title: string | undefined
  cwd: string
}): Promise<void> {
  const sessionID = input.sessionID as SessionID
  const date = new Date().toISOString().slice(0, 10)
  const shortID = sessionID.slice(0, 8)
  const title = (input.title ?? "untitled").replace(/\|/g, "-").trim().slice(0, 60)

  // Write markdown entry
  try {
    const entry = `| ${date} | ${shortID} | ${title} |\n`
    const localDir = path.join(input.cwd, ".agents", "memory")
    const memDir = fs.existsSync(localDir) ? localDir : GLOBAL_MEMORY_DIR
    const memFile = path.join(memDir, MEMORY_FILE)
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true })
    if (!fs.existsSync(memFile)) fs.writeFileSync(memFile, MEMORY_HEADER, "utf-8")
    fs.appendFileSync(memFile, entry, "utf-8")
  } catch {
    // non-fatal
  }

  // Write SQLite row — dynamic import so memory.ts stays usable in non-DB contexts
  try {
    const { Database } = await import("@/storage/db")
    const { MemoryTable } = await import("@/storage/schema")
    const { SessionTable } = await import("@/storage/schema")
    const { eq } = await import("drizzle-orm")

    Database.use((db) => {
      // Look up cost + agent + model from existing session record
      const session = db
        .select({
          cost: SessionTable.cost,
          agent: SessionTable.agent,
          model: SessionTable.model,
        })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()

      db.insert(MemoryTable)
        .values({
          session_id: sessionID,
          date,
          title,
          agent: session?.agent ?? null,
          model_id: session?.model?.id ?? null,
          cost_usd: session?.cost ?? 0,
          cwd: input.cwd,
          slate_tasks: null,
        })
        .onConflictDoUpdate({
          target: MemoryTable.session_id,
          set: { title, cost_usd: session?.cost ?? 0 },
        })
        .run()
    })
  } catch {
    // non-fatal — DB may not be initialised yet in test contexts
  }
}
