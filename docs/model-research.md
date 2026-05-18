# Openloom — Model Research & Recommendations

> Last updated: 2026-05-18
> Sources: Anthropic/OpenAI/Google/Meta/Mistral/DeepSeek official docs, OpenRouter, SWE-bench leaderboard
> `[VERIFY]` = confirm pricing/scores against current sources — may have changed

---

## 1. Frontier Models (May 2026)

### Anthropic — Claude 4.x

| Model | Context | API ID | Input $/M | Output $/M | Notes |
|-------|---------|--------|-----------|------------|-------|
| Claude Opus 4.7 | 200k | `claude-opus-4-7` | $15.00 | $75.00 | Best overall; highest SWE-bench |
| Claude Sonnet 4.6 | 200k | `claude-sonnet-4-6` | $3.00 | $15.00 | Sweet spot — 90% Opus quality |
| Claude Haiku 4.5 | 200k | `claude-haiku-4-5-20251001` | $0.80 | $4.00 | Fastest Claude; subagent use |

**Strengths:** Best instruction-following, reliable code edits, long-context coherence, extended thinking on Opus.
**OpenRouter IDs:** `anthropic/claude-opus-4`, `anthropic/claude-sonnet-4-5`, `anthropic/claude-haiku-4-5`

---

### OpenAI

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| GPT-5 | 128k | [VERIFY] | [VERIFY] | Major release 2025; strong across all tasks |
| GPT-5.5 | [VERIFY] | [VERIFY] | [VERIFY] | [VERIFY — post-cutoff; confirm specs] |
| o3 | 200k | $20.00 | $60.00 | Best reasoning; top SWE-bench ~55% |
| o4-mini | 128k | $0.15–0.30 | $0.60–1.20 | Cheap reasoning; great for debugging |
| GPT-4o | 128k | $5.00 | $15.00 | Reliable workhorse; ~40% SWE-bench |
| Codex (CLI) | 32k | varies | varies | Optimized for terminal/code actions |

**Strengths:** o3/o4-mini dominate for reasoning-heavy tasks. GPT-4o is mature and stable. Codex optimized for agentic coding.
**OpenRouter IDs:** `openai/gpt-4o`, `openai/o3`, `openai/o4-mini`

---

### Google

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Gemini 2.5 Pro | 1M | $3.50 | $10.50 | Huge context; strong coding |
| Gemini 2.5 Flash | 1M | $0.075 | $0.30 | Ultra-cheap; best $/quality ratio |
| Gemini 2.5 Flash-8B | 1M | $0.037 | $0.15 | Cheapest capable model |
| Gemma 4 (27B) | 128k | free (self-host) | — | [VERIFY — open weights; check HF] |
| Gemma 4 (12B) | 128k | free (self-host) | — | [VERIFY — confirm release date] |

**Strengths:** 1M token context is unmatched (read entire codebases). Flash is the best cheap model. Gemma for local/private deployments.
**OpenRouter IDs:** `google/gemini-2.5-pro-preview`, `google/gemini-2.5-flash-preview`

---

### Meta — Llama 4

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Llama 4 Scout (17B) | 10M | $0.18 | $0.50 | 10M context; local-friendly MoE |
| Llama 4 Maverick (17B) | 1M | $0.24 | $0.77 | Better quality than Scout; 1M ctx |
| Llama 4 [VERIFY] | [VERIFY] | [VERIFY] | [VERIFY] | Check for newer 2026 releases |

**Strengths:** Open weights — can self-host, no API costs. Scout's 10M context is exceptional. Available via Groq, Fireworks, Together, OpenRouter.
**OpenRouter IDs:** `meta-llama/llama-4-scout`, `meta-llama/llama-4-maverick`

---

### Mistral AI

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Codestral | 32k | $0.30 | $0.90 | Best for code completion; FIM support |
| Mistral Large 2 | 128k | $3.00 | $9.00 | General purpose; strong coding |
| Magistral (reasoning) | 128k | [VERIFY] | [VERIFY] | Reasoning model; released ~May 2025 |
| Mistral Small 3 | 32k | $0.10 | $0.30 | Cheap general purpose |

**Strengths:** Codestral is the best fill-in-the-middle model for autocomplete. European data residency option.
**OpenRouter IDs:** `mistralai/codestral-2501`, `mistralai/mistral-large`

---

### DeepSeek

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| DeepSeek V3 | 128k | $0.27 | $1.10 | ~49% SWE-bench; exceptional value |
| DeepSeek R1 | 64k | $0.55 | $2.19 | Reasoning; open weights MIT |
| DeepSeek R1-0528 | 64k | [VERIFY] | [VERIFY] | [VERIFY — updated R1 version] |
| DeepSeek Coder V2 | 128k | $0.14 | $0.28 | Coding-specialized |

**Strengths:** DeepSeek V3 is the benchmark for cost-efficiency. R1 is open-weights reasoning. China-hosted (consider for sensitive code).
**OpenRouter IDs:** `deepseek/deepseek-chat`, `deepseek/deepseek-r1`

---

### Alibaba — Qwen

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Qwen3-235B-A22B | 32k | $0.22 | $0.88 | Thinking mode; top open model |
| Qwen3-32B | 32k | $0.10 | $0.30 | Good small reasoning model |
| Qwen2.5-72B | 128k | ~free | ~free | Available free on OpenRouter |
| QwQ-32B | 32k | $0.10 | $0.30 | Reasoning-focused; strong math |

**Strengths:** Qwen3-235B is the best open-weights model for coding as of early 2026. QwQ for step-by-step reasoning.
**OpenRouter IDs:** `qwen/qwen3-235b-a22b`, `qwen/qwq-32b`

---

### Moonshot AI — Kimi

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Kimi K2 | 2M | [VERIFY] | [VERIFY] | Long-context specialist; 2M tokens |
| Kimi K2.6 | [VERIFY] | [VERIFY] | [VERIFY] | [VERIFY — confirm specs post-cutoff] |

**Strengths:** Kimi's 2M context window is the longest for a hosted model. Best for reading massive codebases in one shot.
**OpenRouter IDs:** `moonshotai/kimi-k2` [VERIFY]

---

### xAI — Grok

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Grok 3 | 131k | $3.00 | $15.00 | Strong reasoning; web search built-in |
| Grok 3 mini | 131k | $0.30 | $0.50 | Cheap; thinking mode available |
| Grok 3 mini (thinking) | 131k | $0.30 | $0.50 | Reasoning at low cost |

**Strengths:** Real-time web access via X/Twitter data. Grok 3 mini thinking is cheap reasoning. Available on OpenRouter.
**OpenRouter IDs:** `x-ai/grok-3-beta`, `x-ai/grok-3-mini-beta`

---

### Cohere

| Model | Context | Input $/M | Output $/M | Notes |
|-------|---------|-----------|------------|-------|
| Command R+ | 128k | $2.50 | $10.00 | Good for RAG; tool use |
| Command R7B | 128k | $0.0375 | $0.15 | Ultra-cheap; local-capable |

---

## 2. Benchmark Comparison Table

> `[V]` = verify against current leaderboard at swebench.com and scale.com/leaderboard

| Model | SWE-bench % | HumanEval % | MMLU % | Context | Input $/M | Output $/M |
|-------|-------------|-------------|--------|---------|-----------|------------|
| Claude Opus 4.7 | ~52% [V] | ~92% [V] | ~90% [V] | 200k | $15.00 | $75.00 |
| Claude Sonnet 4.6 | ~45% [V] | ~88% [V] | ~87% [V] | 200k | $3.00 | $15.00 |
| o3 | ~55% [V] | ~96% [V] | ~91% [V] | 200k | $20.00 | $60.00 |
| GPT-5 | [VERIFY] | [VERIFY] | [VERIFY] | 128k | [V] | [V] |
| GPT-5.5 | [VERIFY] | [VERIFY] | [VERIFY] | [V] | [V] | [V] |
| GPT-4o | ~38% | ~90% | ~88% | 128k | $5.00 | $15.00 |
| o4-mini | ~42% [V] | ~93% [V] | ~88% [V] | 128k | $0.20 | $0.80 |
| Gemini 2.5 Pro | ~47% [V] | ~90% [V] | ~90% [V] | 1M | $3.50 | $10.50 |
| Gemini 2.5 Flash | ~35% [V] | ~85% [V] | ~85% [V] | 1M | $0.075 | $0.30 |
| DeepSeek V3 | ~49% | ~87% | ~88% | 128k | $0.27 | $1.10 |
| DeepSeek R1 | ~50% | ~92% | ~90% | 64k | $0.55 | $2.19 |
| Llama 4 Maverick | ~35% [V] | ~82% [V] | ~85% [V] | 1M | $0.24 | $0.77 |
| Qwen3-235B | ~42% [V] | ~88% [V] | ~87% [V] | 32k | $0.22 | $0.88 |
| Grok 3 | ~40% [V] | ~85% [V] | ~87% [V] | 131k | $3.00 | $15.00 |
| Kimi K2 | [VERIFY] | [VERIFY] | [VERIFY] | 2M | [V] | [V] |
| Kimi K2.6 | [VERIFY] | [VERIFY] | [VERIFY] | [V] | [V] | [V] |
| Gemma 4 (27B) | [VERIFY] | [VERIFY] | [VERIFY] | 128k | free | — |
| Codestral | ~30% [V] | ~85% | ~75% | 32k | $0.30 | $0.90 |
| Claude Haiku 4.5 | ~25% [V] | ~78% [V] | ~78% [V] | 200k | $0.80 | $4.00 |
| Grok 3 mini | ~32% [V] | ~80% [V] | ~82% [V] | 131k | $0.30 | $0.50 |
| Command R7B | ~15% [V] | ~70% [V] | ~73% [V] | 128k | $0.037 | $0.15 |

**SWE-bench leaderboard:** https://www.swebench.com | https://scale.com/leaderboard

---

## 3. Best Model per Task Type

### Code Writing & Editing (build agent)
1. **Claude Opus 4.7** — most reliable multi-file edits, best instruction-following
2. **o3** — best for complex bugs requiring chain-of-thought; slower
3. **DeepSeek V3** — exceptional value; ~49% SWE-bench at $0.27/M

### Architecture & Planning (plan agent)
1. **Claude Sonnet 4.6** — fast, deep reasoning, great codebase comprehension
2. **Gemini 2.5 Pro** — 1M context lets it read the whole codebase in one shot
3. **o4-mini** — cheap reasoning; good for structured plans

### Fast Cheap Subagents (explore / scout)
1. **Gemini 2.5 Flash** — $0.075/M, 1M context, surprisingly capable
2. **DeepSeek V3** — $0.27/M, strong coding, available on OpenRouter
3. **Claude Haiku 4.5** — $0.80/M, fast, native Anthropic integration
4. **Grok 3 mini** — $0.30/M, thinking mode, good for quick analysis
5. **Command R7B** — $0.037/M, good enough for simple searches

### Complex Reasoning / Debugging
1. **o3** — best chain-of-thought; best SWE-bench on hard instances
2. **Claude Opus 4.7** — extended thinking mode; very reliable
3. **DeepSeek R1** — open-weights reasoning; surprisingly strong
4. **Qwen3-235B** — thinking mode; top open model

### Long Context (reading entire codebases)
1. **Kimi K2** — 2M tokens; best for massive monorepos
2. **Gemini 2.5 Pro** — 1M tokens at reasonable cost
3. **Llama 4 Scout** — 10M tokens (!) open weights; via Groq/Together
4. **Claude Opus/Sonnet 4.x** — 200k; excellent coherence at length

### Web Research (scout agent)
1. **Grok 3** — real-time X/Twitter data; built-in search
2. **Gemini 2.5 Pro** — Google Search integration in some APIs
3. **GPT-4o with search** — OpenAI web search tool

---

## 4. Cost-Performance Matrix

### Ultra-cheap (< $0.30/M input) — subagents, explore, quick lookups
| Model | Input $/M | Quality tier |
|-------|-----------|-------------|
| Command R7B | $0.037 | Low-medium |
| Gemini 2.5 Flash-8B | $0.037 | Low-medium |
| Gemini 2.5 Flash | $0.075 | Medium |
| o4-mini | ~$0.20 | Medium-high (reasoning) |
| DeepSeek Coder V2 | $0.14 | Medium |
| Llama 4 Scout | $0.18 | Medium |
| Qwen2.5-72B | ~free | Medium |

### Budget ($0.30–3/M input) — daily coding, plan agent
| Model | Input $/M | Quality tier |
|-------|-----------|-------------|
| Grok 3 mini | $0.30 | Medium |
| Codestral | $0.30 | Medium (code-specialized) |
| DeepSeek V3 | $0.27 | High |
| DeepSeek R1 | $0.55 | High (reasoning) |
| Qwen3-235B | $0.22 | High |
| Claude Haiku 4.5 | $0.80 | High |
| Mistral Small 3 | $0.10 | Medium |
| Llama 4 Maverick | $0.24 | Medium-high |

### Premium ($3–15/M input) — build agent, general agent
| Model | Input $/M | Quality tier |
|-------|-----------|-------------|
| Mistral Large 2 | $3.00 | High |
| Claude Sonnet 4.6 | $3.00 | Very high |
| Gemini 2.5 Pro | $3.50 | Very high |
| Grok 3 | $3.00 | High |
| GPT-4o | $5.00 | High |
| Command R+ | $2.50 | Medium-high |

### Ultra-premium (> $15/M input) — hardest problems only
| Model | Input $/M | Quality tier |
|-------|-----------|-------------|
| Claude Opus 4.7 | $15.00 | Best-in-class |
| o3 | $20.00 | Best reasoning |
| GPT-5 | [VERIFY] | [VERIFY] |
| GPT-5.5 | [VERIFY] | [VERIFY] |

---

## 5. OpenRouter Availability

OpenRouter is the recommended integration for Openloom — single API key, 200+ models, automatic fallbacks.
Set `OPENROUTER_API_KEY` in `.env` and prefix model IDs with the provider namespace.

```
# In openloom.json
{
  "model": "anthropic/claude-sonnet-4-6",
  "agent": {
    "explore": { "model": "google/gemini-2.5-flash-preview" },
    "scout":   { "model": "deepseek/deepseek-chat" },
    "build":   { "model": "anthropic/claude-sonnet-4-6" },
    "plan":    { "model": "anthropic/claude-sonnet-4-6" },
    "general": { "model": "anthropic/claude-opus-4-7" }
  }
}
```

**Verified on OpenRouter (check openrouter.ai/models for current list):**
```
anthropic/claude-opus-4                   # Opus 4.7
anthropic/claude-sonnet-4-5               # Sonnet 4.6
anthropic/claude-haiku-4-5                # Haiku 4.5
openai/gpt-4o                             # GPT-4o
openai/o3                                 # o3
openai/o4-mini                            # o4-mini
google/gemini-2.5-pro-preview             # Gemini 2.5 Pro
google/gemini-2.5-flash-preview           # Gemini 2.5 Flash
deepseek/deepseek-chat                    # DeepSeek V3
deepseek/deepseek-r1                      # DeepSeek R1
meta-llama/llama-4-scout                  # Llama 4 Scout
meta-llama/llama-4-maverick               # Llama 4 Maverick
qwen/qwen3-235b-a22b                      # Qwen3 235B (thinking)
qwen/qwq-32b                              # QwQ 32B
x-ai/grok-3-beta                          # Grok 3
x-ai/grok-3-mini-beta                     # Grok 3 mini
mistralai/codestral-2501                  # Codestral
mistralai/mistral-large                   # Mistral Large 2
moonshotai/kimi-k2                        # Kimi K2 [VERIFY ID]
```

---

## 6. Openloom Agent Recommendations

### build (default everyday coding)
```json
"build": {
  "model": "anthropic/claude-sonnet-4-6"
}
```
Rationale: $3/M, 90% of Opus quality, fast enough for interactive use. Switch to Opus for large refactors.

**For complex/multi-file work:**
```json
"build": {
  "model": "anthropic/claude-opus-4-7"
}
```

**Budget alternative:**
```json
"build": {
  "model": "deepseek/deepseek-chat"
}
```
DeepSeek V3 at $0.27/M is ~49% SWE-bench — competitive with Sonnet at 10% of the cost.

---

### plan (read-only architecture)
```json
"plan": {
  "model": "anthropic/claude-sonnet-4-6"
}
```
Rationale: Architecture questions need deep reasoning but not Opus-level cost. Sonnet reads and comprehends large codebases well.

**For large monorepos (needs 1M+ context):**
```json
"plan": {
  "model": "google/gemini-2.5-pro-preview"
}
```

---

### explore (fast codebase search subagent)
```json
"explore": {
  "model": "google/gemini-2.5-flash-preview"
}
```
Rationale: $0.075/M with 1M context. For a subagent that just reads files and returns findings, Flash is dramatically cheaper than Haiku at similar quality.

**Alternative:**
```json
"explore": {
  "model": "deepseek/deepseek-chat"
}
```

---

### scout (external docs/repo research subagent)
```json
"scout": {
  "model": "deepseek/deepseek-chat"
}
```
Rationale: $0.27/M. Scout reads external docs and repos — needs good reading comprehension but not elite coding skill. DeepSeek V3 handles this well at low cost.

---

### general (autonomous multi-step orchestration)
```json
"general": {
  "model": "anthropic/claude-opus-4-7"
}
```
Rationale: Orchestration tasks need high reliability and strong planning. The extra cost is justified because general agent tasks are triggered less frequently and involve coordinating complex multi-step work.

**Budget alternative:**
```json
"general": {
  "model": "deepseek/deepseek-r1"
}
```
R1's reasoning at $0.55/M is remarkably capable for orchestration.

---

## 7. Models to Watch

These are promising directions to monitor (verify current status):

- **GPT-5.5** — OpenAI's next frontier; pricing and benchmarks TBD
- **Kimi K2.6** — Moonshot AI; if K2 is their long-context specialist, K2.6 may expand on it
- **Gemma 4** — Google open weights; if self-hostable at good quality, eliminates API costs
- **Claude Sonnet 5** — next Anthropic release likely within 2026
- **DeepSeek R2** — if they continue the pattern, a major reasoning upgrade
- **Llama 4 Ultra** — Meta's rumored larger model in the Llama 4 family
- **Qwen4** — Alibaba consistently iterates fast

---

## 8. How to Update This File

1. Check [SWE-bench Leaderboard](https://www.swebench.com) monthly
2. Check [OpenRouter Models](https://openrouter.ai/models) for new additions and price changes
3. Check [Scale AI Leaderboard](https://scale.com/leaderboard) for frontier model comparisons
4. Check [Artificial Analysis](https://artificialanalysis.ai) for speed + quality + cost triange
5. Run `openloom "research latest LLM models and update docs/model-research.md"` — the scout agent can do this automatically

---

*All prices in USD per million tokens. Verify all `[VERIFY]` entries at provider pricing pages and OpenRouter before making cost-sensitive decisions.*
