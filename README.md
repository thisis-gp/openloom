# Openloom

An agentic OS for personal and team use — built on top of [OpenCode](https://github.com/anomalyco/opencode) (MIT), extended with Slate task tracking, session memory, and multi-agent coordination.

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
| Desktop app (Tauri) | ✅ |
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

---

## Workspace Layout

```
openloom/
├── packages/
│   ├── opencode/     # Core CLI, agent runtime, server, tools, session DB
│   ├── app/          # React web/desktop UI
│   ├── desktop/      # Tauri desktop wrapper
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
bun run dev:desktop   # Start desktop app (requires Rust + Tauri)
bun run typecheck     # Type check all packages
```

---

## Based On

Openloom is a fork of [OpenCode](https://github.com/anomalyco/opencode) (MIT License) by the SST team.
The core architecture — agent runtime, tool system, session persistence, TUI, desktop app — comes from OpenCode.

Openloom adds: `.env` support, Slate task tracking integration, branding, and agentic OS features.
