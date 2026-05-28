import fs from "fs"
import path from "path"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.cursor" })

/**
 * Drop a task file into .cursor/tasks/ for Cursor Background Agent to pick up.
 * Cursor must be open in the target workspace.
 * Note: Cursor has no stable CLI invocation API — this is a file-drop integration.
 */
export async function dropCursorTask(
  goal: string,
  opts: { cwd?: string; taskId?: string } = {},
): Promise<{ taskFile: string }> {
  const cwd = opts.cwd ?? process.cwd()
  const tasksDir = path.join(cwd, ".cursor", "tasks")
  fs.mkdirSync(tasksDir, { recursive: true })

  const id = Date.now()
  const taskFile = path.join(tasksDir, `openloom-${id}.md`)
  fs.writeFileSync(taskFile, `# OpenLoom Task\n\n${goal}\n`, "utf8")

  log.info("cursor task dropped", { taskFile, taskId: opts.taskId })
  return { taskFile }
}
