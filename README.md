# Openloom

An agentic OS for personal and team use — orchestrate goals into tasks, delegate to AI workers (Claude, Codex, Cursor), gate with QA and review agents, and self-improve over time via a weekly skill curator.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/thisis-gp/openloom
cd openloom

# 2. Set up your API key
cp .env.example .env
# Edit .env and add your key — OpenRouter, Anthropic, OpenAI, etc.

# 3. Install and run
bun install
bun run dev        # terminal UI
bun run dev:web    # web app (localhost)
```

---

## Configuration

API keys go in `.env` at the repo root (loaded automatically on startup):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
ANTHROPIC_API_KEY=sk-ant-...
# See .env.example for all supported providers
```

Project-level settings go in `openloom.json` in your project directory:

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "mcp": {
    "my-server": { "type": "stdio", "command": "npx my-mcp-server" }
  }
}
```

Global settings go in `~/.config/openloom/openloom.json`.

---

## Agents

Switch between agents with **Tab**:

| Agent | Access | Use for |
|-------|--------|---------|
| `build` | Full (read + write + shell) | Active development |
| `plan` | Read-only | Exploring and planning |
| `general` | Full | Complex multi-step tasks (invoked via `@general`) |

Custom agents: add `.md` files to `.openloom/agents/` in your project.

---

## Features

| Feature | Status |
|---------|--------|
| Multi-provider LLM (Anthropic, OpenRouter, OpenAI, Gemini, Groq, Mistral, Bedrock, 15+ more) | ✅ |
| Terminal UI (OpenTUI) | ✅ |
| Desktop app (Electron) | ✅ |
| Web UI (React/Vite) | ✅ |
| Session persistence (SQLite) + resume | ✅ |
| Built-in tools: read, write, edit, shell, glob, grep, webfetch, websearch, LSP | ✅ |
| MCP server support | ✅ |
| Skills (context injection via `.openloom/skills/`) | ✅ |
| Plugin system (`.openloom/plugins/`) | ✅ |
| Custom tools (`.openloom/tools/`) | ✅ |
| VS Code extension | ✅ |
| Zed extension | ✅ |
| Slack integration | ✅ |
| `.env` file support | ✅ |
| Telegram bot integration | ✅ |
| Docker shell backend | ✅ |
| HNSW vector memory (scales to 500+ entries) | ✅ |
| Codex CLI subagent (`agent: "codex"`) | ✅ |
| Claude Code CLI subagent (`agent: "claude"`) | ✅ |
| Cursor file-drop subagent (`agent: "cursor"`) | ✅ |
| Orchestrator agent (goal → Slate tasks → sequential workers) | ✅ |
| Slate task tracking (todo → in_progress → done/blocked) | ✅ |
| Per-task worklog (started_at, ended_at, duration, summary) | ✅ |
| QA agent (typecheck + test + build → structured pass/fail report) | ✅ |
| Review agent (git diff → correctness/security/requirements findings) | ✅ |
| Two-stage approval gate (QA + review in parallel → user approval) | ✅ |
| Signal logger (zero-cost run telemetry → `~/.agents/signals/`) | ✅ |
| Skill curator (weekly haiku-model batch review → global/project skills) | ✅ |
| Startup catch-up (curator runs on next start if weekly window missed) | ✅ |

---

## External Agent Backends

Use the `delegate_task` tool with an `agent` field to run tasks in external CLI tools:

| Agent value | Requires | What it does |
|-------------|----------|--------------|
| `build` (default) | — | OpenLoom internal session |
| `codex` | `npm i -g @openai/codex` + `codex login` | Runs goal in Codex CLI (uses ChatGPT Plus subscription) |
| `claude` | Claude Code CLI in PATH | Runs goal in Claude Code CLI (uses Claude subscription) |
| `cursor` | Cursor IDE open in workspace | Drops task file to `.cursor/tasks/` for Cursor Background Agent |

**Example via chat:**
> "Delegate to Codex: build a TypeScript utility that parses CSV files"

**Or programmatically:**
```json
{
  "tool": "delegate_task",
  "goal": "Build a CSV parser utility in TypeScript",
  "agent": "codex"
}
```

---

## Workspace Layout

```
openloom/
├── packages/
│   ├── opencode/     # Core CLI, agent runtime, server, tools, session DB
│   ├── app/          # React web/desktop UI
│   ├── desktop/      # Electron desktop wrapper
│   ├── ui/           # Shared UI components
│   ├── llm/          # LLM provider abstraction
│   ├── plugin/       # Plugin system
│   ├── sdk/          # JavaScript/TypeScript SDK
│   ├── slack/        # Slack bot integration
│   └── ...
├── sdks/vscode/      # VS Code extension
├── .env.example      # API key template
└── openloom.json     # (create this in your project dir)
```

---

## Dev Scripts

```bash
bun run dev           # Start terminal UI
bun run dev:web       # Start web app (React, localhost:5173)
bun run dev:desktop   # Start desktop app
bun run dev:telegram  # Start Telegram bot
bun run typecheck     # Type check all packages
```

---

## Credits

The core agent runtime, tool system, session persistence, TUI, and desktop app architecture are derived from [OpenCode](https://github.com/sst/opencode) (MIT License) by the SST team.
