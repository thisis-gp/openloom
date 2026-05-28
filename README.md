# Openloom

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-fbf0df?logo=bun)](https://bun.sh)

**Give Openloom a goal. It plans, delegates, reviews, and ships — then learns from every run.**

Openloom is an agentic OS that turns natural-language goals into tracked tasks, delegates them to AI workers (Claude Code, Codex, Cursor), gates the result through QA and code review agents, and self-improves weekly via a skill curator that reads run history.

> Forked from [OpenCode](https://github.com/sst/opencode) by the SST team — extended into a full orchestration system.

---

## How It Works

```
You: "Add user authentication with JWT"
              │
              ▼
      Orchestrator Agent
  decomposes goal → creates Slate tasks → assigns workers
              │
              ▼
        Dispatcher
  runs workers one at a time — each updates its task state + writes a worklog
              │
         ┌────┴────┐
         ▼         ▼
      QA Agent   Review Agent        ← parallel
      typecheck  git diff →
      test run   correctness +
      build      security check
         └────┬────┘
              ▼
       Approval Gate
  combined report → you approve or request changes
              │
              ▼
  Signal Logger → ~/.agents/signals/
  Skill Curator (weekly) → writes/updates skills from run history
```

---

## Quick Start

```bash
git clone https://github.com/thisis-gp/openloom
cd openloom
cp .env.example .env        # add your API key
bun install
bun run dev                 # terminal UI
bun run dev:web             # web app (localhost:5173)
```

Then give it a goal:

> "Build a REST endpoint for user registration, write tests, and document it"

The orchestrator breaks this into Slate tasks, spawns workers, runs QA and review, then surfaces a combined report for your approval.

---

## Slate — Task Tracking for Agents

Openloom's orchestrator is built around [Slate](https://github.com/thisis-gp/slate) — a task tracking CLI and kanban UI designed specifically for agentic workflows.

Without Slate, Openloom works as a capable coding assistant. **With Slate, it becomes a full orchestration loop:**

- Workers update their own task state (`todo → in_progress → done`)
- Every task gets a structured worklog with timing and outcome
- QA and review reports attach to the task as comments
- The approval gate drives project-level state (`needs-user-approval → complete`)
- Run history feeds the weekly skill curator so the system improves over time

**Get Slate running in 2 minutes:**

```bash
# Requirements: Python 3.11+, uv
cd packages/core && uv sync

# Start the API server
uv run uvicorn slate.api.app:create_app --factory --host 0.0.0.0 --port 7331

# Create your first project
uv run slate project create "my-app" --desc "My application"
```

We recommend setting up Slate before using the orchestrator for the best experience.

---

## Configuration

API keys in `.env` at the repo root:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
ANTHROPIC_API_KEY=sk-ant-...
# See .env.example for all supported providers
```

Project-level settings in `openloom.json` in your project directory:

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "mcp": {
    "my-server": { "type": "stdio", "command": "npx my-mcp-server" }
  }
}
```

Global settings in `~/.config/openloom/openloom.json`.

---

## Agents

Switch agents with **Tab** in the TUI:

| Agent | Access | Use for |
|-------|--------|---------|
| `build` | Full (read + write + shell) | Active development |
| `plan` | Read-only | Exploring and planning |
| `general` | Full | Complex multi-step tasks (`@general`) |
| `orchestrator` | Full | Decompose a goal into tasks and drive workers |

Custom agents: drop `.md` files into `.openloom/agents/` in your project.

---

## Orchestration

The orchestrator follows a fixed lifecycle per run:

1. **Plan** — decomposes your goal into up to 5 Slate tasks, assigns each a worker type and model
2. **Execute** — dispatcher spawns workers sequentially; each writes a worklog on completion
3. **Gate** — QA agent (typecheck + tests + build) and Review agent (git diff + security) run in parallel
4. **Approve** — combined report surfaces to you; approve to ship or reject to re-plan
5. **Learn** — every run writes a signal log; the weekly curator reads signals and writes new skills

**Task states:** `todo → in_progress → done | blocked`

**Project states:** `planning → in_progress → needs-user-approval → complete | needs-rework`

---

## External Workers

Use `delegate_task` with an `agent` field to run tasks in external CLI tools:

| Agent | Requires | What it does |
|-------|----------|--------------|
| `build` (default) | — | Openloom internal session |
| `codex` | `npm i -g @openai/codex` + `codex login` | Runs in Codex CLI |
| `claude` | Claude Code CLI in PATH | Runs in Claude Code CLI |
| `cursor` | Cursor IDE open in workspace | Drops task to `.cursor/tasks/` |

---

## Features

**Core**
- Multi-provider LLM: Anthropic, OpenRouter, OpenAI, Gemini, Groq, Mistral, Bedrock, 15+ more
- Terminal UI, Desktop app (Electron), Web UI (React/Vite)
- Session persistence (SQLite) + resume
- Built-in tools: read, write, edit, shell, glob, grep, webfetch, websearch, LSP
- MCP server support, plugin system, custom tools, `.env` file support

**Orchestration**
- Orchestrator agent: goal → Slate tasks → sequential workers
- Dispatcher: sequential worker execution with per-task worklog
- QA agent: typecheck + test + build → structured pass/fail report
- Review agent: git diff → correctness, security, missed-requirements findings
- Two-stage approval gate: QA + review in parallel → user decision
- Signal logger: zero-cost run telemetry to `~/.agents/signals/`
- Skill curator: weekly batch review of signals → global + project skills
- Startup catch-up: curator runs on next launch if weekly window was missed

**Integrations**
- VS Code + Zed extensions
- Slack + Telegram bots
- Docker shell backend
- HNSW vector memory (500+ entries)

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
└── .env.example      # API key template
```

---

## Dev Scripts

```bash
bun run dev           # Terminal UI
bun run dev:web       # Web app (localhost:5173)
bun run dev:desktop   # Desktop app
bun run dev:telegram  # Telegram bot
bun run typecheck     # Type check all packages
bun test              # Run test suite
```

---

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- [Report a bug](https://github.com/thisis-gp/openloom/issues/new?template=bug_report)
- [Request a feature](https://github.com/thisis-gp/openloom/issues/new?template=feature_request)

---

## Credits

Core agent runtime, tool system, session persistence, TUI, and desktop app architecture derived from [OpenCode](https://github.com/sst/opencode) (MIT) by the SST team.
