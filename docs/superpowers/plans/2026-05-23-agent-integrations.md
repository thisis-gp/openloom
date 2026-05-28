# Agent Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram messaging, HNSW vector indexing, Docker shell backend, and Codex/Claude CLI agent backends to OpenLoom.

**Architecture:** Three independent subsystems — (1) a Telegram package mirroring `packages/slack`, wired to the OpenLoom SDK; (2) HNSW vector search replacing the flat O(n) scan in `packages/opencode/src/memory/vector/`; (3) external agent backends (Docker shell, Codex CLI, Claude CLI) in `packages/opencode/src/subagent/backends/`. Cursor is an IDE with no stable CLI invocation API — it is implemented as a workspace file-drop integration only.

**Tech Stack:** grammy (Telegram), hnswlib-node (HNSW), dockerode (Docker), child_process (Codex/Claude CLI), Effect, TypeScript, Bun

---

## Subsystem 1: Telegram

### Task 1: Create `packages/telegram` package

**Files:**
- Create: `packages/telegram/package.json`
- Create: `packages/telegram/tsconfig.json`
- Create: `packages/telegram/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@openloom/telegram",
  "version": "1.0.0",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "dev": "bun run src/index.ts",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@openloom/sdk": "workspace:*",
    "grammy": "^1.34.0"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install grammy**

Run: `bun add grammy --cwd packages/telegram`

Expected: grammy added to packages/telegram/package.json

- [ ] **Step 4: Create src/index.ts**

```typescript
import { Bot, Context } from "grammy"
import { createOpencode, type ToolPart } from "@openloom/sdk"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

console.log("🚀 Starting OpenLoom Telegram bot...")
const openloom = await createOpencode({ port: 0 })
console.log("✅ OpenLoom server ready")

const bot = new Bot(BOT_TOKEN)

// Map chat_id → { sessionId }
const sessions = new Map<number, { sessionId: string }>()

// Stream tool updates back to Telegram
void (async () => {
  const events = await openloom.client.event.subscribe()
  for await (const event of events.stream) {
    if (event.type !== "message.part.updated") continue
    const part = event.properties.part
    if (part.type !== "tool") continue
    if (part.state.status !== "completed") continue

    for (const [chatId, session] of sessions.entries()) {
      if (session.sessionId !== part.sessionID) continue
      await bot.api
        .sendMessage(chatId, `🔧 *${part.tool}* — ${part.state.title}`, {
          parse_mode: "Markdown",
        })
        .catch(() => {})
    }
  }
})()

bot.command("start", async (ctx: Context) => {
  await ctx.reply(
    "👋 Hello! I'm your OpenLoom AI assistant. Send me a message to start coding.",
  )
})

bot.command("reset", async (ctx: Context) => {
  const chatId = ctx.chat?.id
  if (!chatId) return
  sessions.delete(chatId)
  await ctx.reply("🔄 Session reset. Send a new message to start fresh.")
})

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id
  const text = ctx.message.text

  if (text.startsWith("/")) return

  let session = sessions.get(chatId)

  if (!session) {
    const created = await openloom.client.session.create({
      body: { title: `Telegram ${chatId}` },
    })
    session = { sessionId: created.id }
    sessions.set(chatId, session)
  }

  // Acknowledge immediately
  const ack = await ctx.reply("⏳ Working on it...")

  try {
    await openloom.client.session.chat({
      path: { id: session.sessionId },
      body: {
        parts: [{ type: "text", text }],
      },
    })

    const messages = await openloom.client.session.messages({
      path: { id: session.sessionId },
    })

    const lastAssistant = [...messages]
      .reverse()
      .find((m: any) => m.role === "assistant")

    const replyText =
      lastAssistant?.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") ?? "✅ Done."

    await bot.api.editMessageText(chatId, ack.message_id, replyText, {
      parse_mode: "Markdown",
    })
  } catch (err) {
    await bot.api.editMessageText(
      chatId,
      ack.message_id,
      `❌ Error: ${String(err)}`,
    )
  }
})

bot.catch((err) => {
  console.error("Telegram bot error:", err)
})

console.log("🤖 Telegram bot starting (long-polling)...")
bot.start()
```

- [ ] **Step 5: Add to root package.json dev scripts**

In `package.json` at repo root, add to `scripts`:
```json
"dev:telegram": "bun run packages/telegram/src/index.ts"
```

- [ ] **Step 6: Add TELEGRAM_BOT_TOKEN to .env.example**

In `.env.example`, add:
```
# Telegram Bot (get token from @BotFather on Telegram)
TELEGRAM_BOT_TOKEN=
```

- [ ] **Step 7: Smoke test**

```
TELEGRAM_BOT_TOKEN=your_token bun run dev:telegram
```

Expected: "OpenLoom server ready" and "Telegram bot starting (long-polling)..." — no crash.

- [ ] **Step 8: Commit**

```bash
git add packages/telegram/ .env.example package.json
git commit -m "feat: add Telegram bot package"
```

---

## Subsystem 2: HNSW Vector Indexing

### Task 2: Install hnswlib-node and add HNSW backend

**Files:**
- Create: `packages/opencode/src/memory/vector/hnsw.ts`
- Modify: `packages/opencode/src/memory/vector/vector.ts`
- Modify: `packages/opencode/src/memory/vector/flat.ts` (add comment only)

- [ ] **Step 1: Install hnswlib-node**

Run: `bun add hnswlib-node --cwd packages/opencode`

Expected: hnswlib-node appears in packages/opencode/package.json

- [ ] **Step 2: Create hnsw.ts**

```typescript
/**
 * HNSW (Hierarchical Navigable Small World) vector index.
 * O(log n) search vs O(n) flat scan — use when archive size > 500.
 */
import { HierarchicalNSW } from "hnswlib-node"

export type HnswEntry = { id: string; label: number }

export class HnswIndex {
  private index: HierarchicalNSW
  private labelToId = new Map<number, string>()
  private idToLabel = new Map<string, number>()
  private nextLabel = 0
  private dim: number

  constructor(dim: number, maxElements = 10_000) {
    this.dim = dim
    this.index = new HierarchicalNSW("cosine", dim)
    this.index.initIndex(maxElements)
  }

  get size(): number {
    return this.nextLabel
  }

  add(id: string, vector: number[]): void {
    if (vector.length !== this.dim) {
      throw new Error(`Vector dim mismatch: expected ${this.dim}, got ${vector.length}`)
    }
    if (this.idToLabel.has(id)) return // already indexed

    const label = this.nextLabel++
    this.index.addPoint(vector, label)
    this.labelToId.set(label, id)
    this.idToLabel.set(id, label)
  }

  search(query: number[], k: number): Array<{ id: string; score: number }> {
    if (this.nextLabel === 0) return []
    const count = Math.min(k, this.nextLabel)
    const result = this.index.searchKnn(query, count)
    return result.neighbors.map((label: number, i: number) => ({
      id: this.labelToId.get(label) ?? "",
      // hnswlib returns distances; convert cosine distance to similarity
      score: 1 - (result.distances[i] ?? 0),
    }))
  }

  has(id: string): boolean {
    return this.idToLabel.has(id)
  }
}
```

- [ ] **Step 3: Modify vector.ts to use HNSW when size > 500**

Replace the `layer` implementation in `packages/opencode/src/memory/vector/vector.ts`:

```typescript
import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Provider } from "@/provider/provider"
import { VectorEmbeddingTable } from "./vector.sql"
import { MemoryArchiveTable } from "@/memory/curator/curator.sql"
import { SessionID } from "@/session/schema"
import { topK } from "./flat"
import { embedText } from "./embed"
import { HnswIndex } from "./hnsw"

export type VectorDeps = Config.Service | Auth.Service | Provider.Service

export interface Interface {
  readonly index: (input: {
    archiveID: string
    sessionID: SessionID
    content: string
  }) => Effect.Effect<string | null, never, VectorDeps>

  readonly search: (input: {
    query: string
    limit: number
  }) => Effect.Effect<Array<{ archiveID: string; sessionID: SessionID; score: number }>, never, VectorDeps>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/VectorService") {}

// HNSW index is built lazily and kept in memory per process lifetime.
// It is rebuilt from DB rows on first search after a cold start.
let hnswCache: HnswIndex | null = null
const HNSW_THRESHOLD = 500

function getOrBuildHnsw(
  entries: Array<{ id: string; vector: number[] }>,
): HnswIndex {
  if (!hnswCache || hnswCache.size !== entries.length) {
    const dim = entries[0]?.vector.length ?? 1536
    const idx = new HnswIndex(dim, Math.max(entries.length * 2, 1000))
    for (const e of entries) idx.add(e.id, e.vector)
    hnswCache = idx
  }
  return hnswCache
}

export const layer: Layer.Layer<Service, never, Config.Service | Auth.Service | Provider.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      index: ({ archiveID, sessionID, content }) =>
        Effect.gen(function* () {
          const existing = Database.use((db) =>
            db.select().from(VectorEmbeddingTable).where(eq(VectorEmbeddingTable.archive_id, archiveID)).get(),
          )
          if (existing) {
            // Keep HNSW cache in sync
            if (hnswCache && !hnswCache.has(existing.id)) {
              hnswCache.add(existing.id, existing.vector)
            }
            return existing.id
          }

          const embedded = yield* embedText(content)
          if (!embedded) return null

          const id = crypto.randomUUID()
          const now = Date.now()
          Database.use((db) =>
            db
              .insert(VectorEmbeddingTable)
              .values({
                id,
                archive_id: archiveID,
                session_id: sessionID,
                model: embedded.model,
                vector: embedded.vector,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          Database.use((db) =>
            db.update(MemoryArchiveTable).set({ embedding_id: id }).where(eq(MemoryArchiveTable.id, archiveID)).run(),
          )

          // Invalidate HNSW cache so it rebuilds on next search
          hnswCache = null

          return id
        }),

      search: ({ query, limit }) =>
        Effect.gen(function* () {
          const embedded = yield* embedText(query)
          if (!embedded) return []

          const allEmbeddings = Database.use((db) => db.select().from(VectorEmbeddingTable).all())
          if (allEmbeddings.length === 0) return []

          let results: Array<{ id: string; score: number }>

          if (allEmbeddings.length >= HNSW_THRESHOLD) {
            // Use HNSW for large archives
            const hnsw = getOrBuildHnsw(
              allEmbeddings.map((e) => ({ id: e.id, vector: e.vector })),
            )
            results = hnsw.search(embedded.vector, limit)
          } else {
            // Fall back to flat scan for small archives
            results = topK(
              embedded.vector,
              allEmbeddings.map((e) => ({ id: e.id, vector: e.vector })),
              limit,
            )
          }

          return results.map((r) => {
            const row = allEmbeddings.find((e) => e.id === r.id)!
            return {
              archiveID: row.archive_id,
              sessionID: row.session_id as SessionID,
              score: r.score,
            }
          })
        }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Auth.defaultLayer),
)

export * as VectorService from "./vector"
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck --filter @openloom/opencode`

Expected: No errors in memory/vector files.

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/memory/vector/hnsw.ts packages/opencode/src/memory/vector/vector.ts packages/opencode/package.json
git commit -m "feat: add HNSW vector indexing with flat fallback under 500 entries"
```

---

## Subsystem 3: Agent Backends

### Task 3: Docker shell backend

**Files:**
- Create: `packages/opencode/src/shell/backends/docker.ts`
- Create: `packages/opencode/src/shell/backends/index.ts`

- [ ] **Step 1: Install dockerode**

Run: `bun add dockerode @types/dockerode --cwd packages/opencode`

Expected: dockerode appears in packages/opencode/package.json

- [ ] **Step 2: Create docker.ts**

```typescript
import { spawn } from "child_process"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "shell.docker" })

export type DockerRunOptions = {
  image: string
  workdir?: string
  env?: Record<string, string>
  mountCwd?: boolean
}

/**
 * Spawn a command inside a Docker container.
 * The container is ephemeral — created per-command, auto-removed on exit.
 */
export async function dockerRun(
  cmd: string[],
  opts: DockerRunOptions,
  onData: (chunk: string) => void,
): Promise<{ exitCode: number }> {
  const args: string[] = ["run", "--rm", "--init"]

  if (opts.workdir) {
    args.push("-w", opts.workdir)
  }

  if (opts.mountCwd) {
    const cwd = process.cwd()
    args.push("-v", `${cwd}:${opts.workdir ?? "/workspace"}`)
  }

  for (const [k, v] of Object.entries(opts.env ?? {})) {
    args.push("-e", `${k}=${v}`)
  }

  args.push(opts.image, ...cmd)

  log.info("docker run", { image: opts.image, cmd })

  return new Promise((resolve) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] })

    proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()))
    proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()))

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      onData(`Docker error: ${err.message}\n`)
      resolve({ exitCode: 1 })
    })
  })
}

/** Check if Docker daemon is reachable. */
export async function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["info"], { stdio: "ignore" })
    proc.on("close", (code) => resolve(code === 0))
    proc.on("error", () => resolve(false))
  })
}
```

- [ ] **Step 3: Create backends/index.ts**

```typescript
export { dockerRun, dockerAvailable } from "./docker"
```

- [ ] **Step 4: Verify docker is reachable from a quick script**

```bash
node -e "const {spawn} = require('child_process'); const p = spawn('docker', ['info'], {stdio:'ignore'}); p.on('close', c => console.log('docker exit:', c))"
```

Expected: `docker exit: 0`

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/shell/backends/
git commit -m "feat: add Docker shell backend"
```

---

### Task 4: Codex CLI agent backend

**Files:**
- Create: `packages/opencode/src/subagent/backends/codex.ts`
- Create: `packages/opencode/src/subagent/backends/claude-cli.ts`
- Create: `packages/opencode/src/subagent/backends/cursor.ts`
- Create: `packages/opencode/src/subagent/backends/index.ts`
- Modify: `packages/opencode/src/subagent/delegate.ts`

- [ ] **Step 1: Create codex.ts**

```typescript
import { spawn } from "child_process"
import { which } from "@/util/which"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.codex" })

export type CodexResult = {
  output: string
  exitCode: number
}

/**
 * Invoke Codex CLI with a goal prompt.
 * Requires: `codex` installed and authenticated via `codex login`.
 */
export async function runCodex(
  goal: string,
  opts: { cwd?: string; timeout?: number } = {},
): Promise<CodexResult> {
  const bin = await which("codex")
  if (!bin) {
    return {
      output: "Codex CLI not found. Install with: npm install -g @openai/codex",
      exitCode: 1,
    }
  }

  const args = ["exec", "--quiet", "-"]
  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 5 * 60 * 1000 // 5 min default

  log.info("codex exec", { cwd, goal: goal.slice(0, 80) })

  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc = spawn(bin, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdin.write(goal)
    proc.stdin.end()

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.stderr.on("data", (c: Buffer) => chunks.push(c.toString()))

    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      chunks.push("\n[Codex: timed out]")
    }, timeout)

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ output: chunks.join(""), exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ output: `Codex spawn error: ${err.message}`, exitCode: 1 })
    })
  })
}

export async function codexAvailable(): Promise<boolean> {
  return !!(await which("codex"))
}
```

- [ ] **Step 2: Create claude-cli.ts**

```typescript
import { spawn } from "child_process"
import { which } from "@/util/which"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.claude-cli" })

export type ClaudeCliResult = {
  output: string
  exitCode: number
}

/**
 * Invoke Claude Code CLI with a goal prompt in non-interactive print mode.
 * Requires: `claude` installed and authenticated.
 * Uses subscription auth — no API key needed.
 */
export async function runClaudeCli(
  goal: string,
  opts: {
    cwd?: string
    maxTurns?: number
    allowedTools?: string[]
    timeout?: number
  } = {},
): Promise<ClaudeCliResult> {
  const bin = await which("claude")
  if (!bin) {
    return {
      output: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
      exitCode: 1,
    }
  }

  const args: string[] = [
    "--print",
    "--output-format", "text",
    "--max-turns", String(opts.maxTurns ?? 10),
  ]

  if (opts.allowedTools?.length) {
    args.push("--allowedTools", opts.allowedTools.join(","))
  }

  args.push("-p", goal)

  const cwd = opts.cwd ?? process.cwd()
  const timeout = opts.timeout ?? 10 * 60 * 1000

  log.info("claude -p", { cwd, goal: goal.slice(0, 80) })

  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()))
    proc.stderr.on("data", (c: Buffer) => chunks.push(c.toString()))

    const timer = setTimeout(() => {
      proc.kill("SIGTERM")
      chunks.push("\n[Claude CLI: timed out]")
    }, timeout)

    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ output: chunks.join(""), exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ output: `Claude CLI spawn error: ${err.message}`, exitCode: 1 })
    })
  })
}

export async function claudeCliAvailable(): Promise<boolean> {
  return !!(await which("claude"))
}
```

- [ ] **Step 3: Create cursor.ts**

> Note: Cursor is an IDE with no stable CLI invocation API for goal-based execution. This backend writes a `.cursor/tasks/` file that Cursor's Background Agent can pick up — it is a file-drop integration, not a direct invocation.

```typescript
import fs from "fs"
import path from "path"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "subagent.cursor" })

/**
 * Drop a task file into .cursor/tasks/ for Cursor Background Agent to pick up.
 * Cursor must already be open in the target workspace.
 */
export async function dropCursorTask(
  goal: string,
  opts: { cwd?: string } = {},
): Promise<{ taskFile: string }> {
  const cwd = opts.cwd ?? process.cwd()
  const tasksDir = path.join(cwd, ".cursor", "tasks")
  fs.mkdirSync(tasksDir, { recursive: true })

  const id = Date.now()
  const taskFile = path.join(tasksDir, `openloom-${id}.md`)
  const content = `# OpenLoom Task\n\n${goal}\n`

  fs.writeFileSync(taskFile, content, "utf8")
  log.info("cursor task dropped", { taskFile })

  return { taskFile }
}
```

- [ ] **Step 4: Create backends/index.ts**

```typescript
export { runCodex, codexAvailable } from "./codex"
export { runClaudeCli, claudeCliAvailable } from "./claude-cli"
export { dropCursorTask } from "./cursor"
```

- [ ] **Step 5: Add `codex` and `claude_cli` as agent types in delegate.ts**

In `packages/opencode/src/subagent/delegate.ts`, update the `agent` field description:

```typescript
agent: Schema.optional(Schema.String).annotate({
  description:
    "Agent mode to use for the subagent. Options: 'build' (default, OpenLoom internal), 'codex' (Codex CLI), 'claude' (Claude Code CLI), 'cursor' (Cursor file-drop).",
}),
```

Then update `toTaskParams` to route to external backends:

```typescript
import { runCodex, codexAvailable } from "./backends/codex"
import { runClaudeCli, claudeCliAvailable } from "./backends/claude-cli"
import { dropCursorTask } from "./backends/cursor"
import { Effect } from "effect"

// Add this helper before toTaskParams
function isExternalAgent(agent: string | undefined): boolean {
  return agent === "codex" || agent === "claude" || agent === "cursor"
}

// Replace the execute in DelegateTaskTool with:
execute: (params: Params, ctx: Tool.Context) => {
  const agent = params.agent ?? "build"

  if (agent === "codex") {
    return Effect.tryPromise(async () => {
      const available = await codexAvailable()
      if (!available) return "Codex CLI not installed. Run: npm install -g @openai/codex && codex login"
      const result = await runCodex(params.goal)
      return result.output || "Codex completed with no output."
    }).pipe(Effect.orDie)
  }

  if (agent === "claude") {
    return Effect.tryPromise(async () => {
      const available = await claudeCliAvailable()
      if (!available) return "Claude CLI not found at 'claude' in PATH."
      const result = await runClaudeCli(params.goal)
      return result.output || "Claude CLI completed with no output."
    }).pipe(Effect.orDie)
  }

  if (agent === "cursor") {
    return Effect.tryPromise(async () => {
      const { taskFile } = await dropCursorTask(params.goal)
      return `Task dropped to Cursor: ${taskFile}. Open Cursor to pick it up.`
    }).pipe(Effect.orDie)
  }

  // Default: OpenLoom internal task
  return task.execute(toTaskParams(params), ctx).pipe(Effect.orDie)
},
```

- [ ] **Step 6: Verify typecheck**

Run: `bun run typecheck --filter @openloom/opencode`

Expected: No errors in subagent files.

- [ ] **Step 7: Quick smoke test — Claude CLI**

```bash
node -e "
const {spawn} = require('child_process');
const p = spawn('claude', ['--print', '--output-format', 'text', '--max-turns', '1', '-p', 'Say hello in one word'], {stdio: ['ignore','pipe','pipe']});
p.stdout.on('data', d => process.stdout.write(d));
p.on('close', c => console.log('exit:', c));
"
```

Expected: One word response + `exit: 0`

- [ ] **Step 8: Commit**

```bash
git add packages/opencode/src/subagent/
git commit -m "feat: add Codex, Claude CLI, and Cursor agent backends"
```

---

## Final: Wire Telegram to .env and document

### Task 5: Update README and env docs

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Update README.md Features table**

In the Features table, add:
```markdown
| Telegram bot integration | ✅ |
| Docker shell backend | ✅ |
| HNSW vector memory (>500 entries) | ✅ |
| Codex CLI subagent | ✅ |
| Claude Code CLI subagent | ✅ |
```

- [ ] **Step 2: Document agent backends in README**

Add a new section after the Agents table:

```markdown
## External Agent Backends

Use `delegate_task` with an `agent` field to run tasks in external CLIs:

| Agent value | Requires | What it does |
|------------|----------|--------------|
| `build` (default) | — | OpenLoom internal session |
| `codex` | `npm i -g @openai/codex` + `codex login` | Runs goal in Codex CLI |
| `claude` | Claude Code CLI (`claude` in PATH) | Runs goal in Claude Code CLI |
| `cursor` | Cursor IDE open in workspace | Drops task file to `.cursor/tasks/` |
```

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document Telegram, Docker, and external agent backends"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Telegram — Task 1 (full grammy bot, session management, tool streaming)
- [x] HNSW vector indexing — Task 2 (HnswIndex class, threshold-based switching, cache invalidation)
- [x] Docker backend — Task 3 (dockerRun, dockerAvailable)
- [x] Codex CLI — Task 4 (runCodex, codexAvailable, routing in delegate.ts)
- [x] Claude CLI — Task 4 (runClaudeCli, claudeCliAvailable, routing in delegate.ts)
- [x] Cursor — Task 4 (dropCursorTask, documented as file-drop limitation)

**Placeholder scan:** No TBDs, no TODOs, no "implement later" — all steps contain complete code.

**Type consistency:**
- `HnswIndex` defined in hnsw.ts, used in vector.ts ✓
- `runCodex` / `codexAvailable` defined in codex.ts, exported from index.ts, imported in delegate.ts ✓
- `runClaudeCli` / `claudeCliAvailable` defined in claude-cli.ts, same chain ✓
- `dropCursorTask` defined in cursor.ts, same chain ✓
