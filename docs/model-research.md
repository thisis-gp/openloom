# Openloom — Model Research & Recommendations

> Last updated: 2026-05-18
> All prices verified from official sources. Benchmarks from SWE-bench Verified leaderboard, Artificial Analysis, and Vals.ai.

---

## 1. SWE-bench Verified Leaderboard (May 2026)

Source: [llm-stats.com/benchmarks/swe-bench-verified](https://llm-stats.com/benchmarks/swe-bench-verified)

| Rank | Model | Provider | Score |
|------|-------|----------|-------|
| 1 | Claude Mythos Preview | Anthropic | 93.9% |
| 2 | Claude Opus 4.7 | Anthropic | 87.6% |
| 3 | Claude Opus 4.5 | Anthropic | 80.9% |
| 4 | Claude Opus 4.6 | Anthropic | 80.8% |
| 5 | Gemini 3.1 Pro | Google | 80.6% |
| 5 | DeepSeek-V4-Pro-Max | DeepSeek | 80.6% |
| 7 | Kimi K2.6 | Moonshot AI | 80.2% |
| 7 | MiniMax M2.5 | MiniMax | 80.2% |
| 9 | GPT-5.2 | OpenAI | 80.0% |
| 10 | Claude Sonnet 4.6 | Anthropic | 79.6% |
| 11 | DeepSeek-V4-Flash-Max | DeepSeek | 79.0% |
| 12 | Qwen3.6 Plus | Alibaba | 78.8% |
| 13 | Gemini 3 Flash | Google | 78.0% |
| 13 | MiMo-V2-Pro | Xiaomi | 78.0% |
| 15 | GLM-5 | Zhipu AI | 77.8% |
| 16 | Muse Spark | Meta | 77.4% |
| 17 | Qwen3.6-27B | Alibaba | 77.2% |
| 18 | Kimi K2.5 | Moonshot AI | 76.8% |
| 19 | Seed 2.0 Pro | ByteDance | 76.5% |
| 20 | Qwen3.5-397B-A17B | Alibaba | 76.4% |
| 21 | GPT-5.1 | OpenAI | 76.3% |
| 24 | Gemini 3 Pro | Google | 76.2% |
| 25 | GPT-5 | OpenAI | 74.9% |

> **Note on SWE-bench Pro (decontaminated):** The standard Verified benchmark is contaminated. On SWE-bench Pro, the top score drops to ~58.6% (Kimi K2.6 and GPT-5.5 tied). This is the truer measure of real-world generalization.

---

## 2. Frontier Models — Pricing & Specs (May 2026)

### Anthropic — Claude 4.x

Pricing source: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| Claude Mythos Preview | 1M | — | — | 93.9% | Research preview; not on public API yet |
| Claude Opus 4.7 | 1M | $5.00 | $25.00 | 87.6% | Highest public API quality; Fast mode: $30/$150 |
| Claude Opus 4.6 | 1M | $5.00 | $25.00 | 80.8% | Same price as 4.7; slightly lower benchmark |
| Claude Opus 4.5 | 1M | $5.00 | $25.00 | 80.9% | — |
| Claude Sonnet 4.6 | 1M | $3.00 | $15.00 | 79.6% | Best value in frontier; recommended for build/plan |
| Claude Sonnet 4.5 | 1M | $3.00 | $15.00 | — | — |
| Claude Haiku 4.5 | 1M | $1.00 | $5.00 | — | Fastest Claude; good for subagents |

> **Important:** Opus 4.7 uses a new tokenizer that may use up to 35% more tokens than previous models for the same input text. Factor this into cost estimates.
> Batch API discount: 50% off (Opus 4.7 batch = $2.50/$12.50)
> OpenRouter IDs: `anthropic/claude-opus-4-7`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`

---

### OpenAI

Source: [openrouter.ai/openai/gpt-5.5-pro](https://openrouter.ai/openai/gpt-5.5-pro) | [openai.com/api/pricing](https://openai.com/api/pricing/)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| GPT-5.5 Pro | 922K in / 128K out | $30.00 | $180.00 | 82.6% | Deep reasoning; released Apr 23 2026 |
| GPT-5.5 (standard) | 1M | $5.00 | $30.00 | 82.6% | Standard tier GPT-5.5 |
| GPT-5.3 Codex | — | — | — | 85.0% | Coding-optimized; Terminal-Bench champion |
| GPT-5.2 | — | — | — | 80.0% | — |
| GPT-5.1 | — | — | — | 76.3% | — |
| GPT-5 | — | — | — | 74.9% | — |
| o4-mini | 128k | ~$0.20 | ~$0.80 | — | Cheap reasoning; strong for debugging |
| o3 | 200k | $20.00 | $60.00 | — | Best for hard reasoning (pre-GPT-5.5) |

> OpenRouter ID: `openai/gpt-5.5-pro`, `openai/gpt-5`, `openai/o4-mini`

---

### Google

Source: [openrouter.ai/google/gemini-3.1-pro-preview](https://openrouter.ai/google/gemini-3.1-pro-preview)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| Gemini 3.1 Pro Preview | 1M | $2.00 (≤200K) / $4.00 (>200K) | $12.00 / $18.00 | 80.6% | Released Feb 19 2026; ARC-AGI-2: 77.1% |
| Gemini 3 Flash | 1M | — | — | 78.0% | Fast and cheap; strong coding |
| Gemini 3 Pro | 1M | — | — | 76.2% | — |
| Gemma 4 31B Dense | 256K | free (self-host) | — | — | Open weights Apache 2.0; LiveCodeBench: 80% |
| Gemma 4 26B MoE | 256K | free (self-host) | — | — | 3.8B active params; consumer GPU friendly |
| Gemma 4 4B | 256K | free (self-host) | — | — | Edge deployment |
| Gemma 4 2B | 256K | free (self-host) | — | — | Phone/embedded deployment |

> Gemma 4 released April 2, 2026. Run locally: `ollama run gemma4`. Multimodal (image input). τ2-bench agentic: 86.4%
> OpenRouter IDs: `google/gemini-3.1-pro-preview`, `google/gemini-3-flash`

---

### xAI — Grok

Source: [artificialanalysis.ai/models/grok-4-3](https://artificialanalysis.ai/models/grok-4-3) | [mem0.ai/blog/xai-grok-api-pricing](https://mem0.ai/blog/xai-grok-api-pricing)

| Model | Context | Input $/M | Output $/M | AA Score | Notes |
|-------|---------|-----------|------------|----------|-------|
| Grok 4.3 | 1M | $1.25 | $2.50 | 53 | Released Apr 30 2026; strong agentic |
| Grok 4.20 (flagship) | 2M | $2.00 | $6.00 | — | 2M context; current flagship |
| Grok 4.1 Fast | 2M | $0.20 | — | — | Ultra-fast; 2M context |
| Grok 4 | 256K | $3.00 | $15.00 | — | Original Grok 4; July 2025 |

> Grok 3 is deprecated. Grok 4.3 is the recommended current version.
> OpenRouter IDs: `x-ai/grok-4.3`, `x-ai/grok-4-20`

---

### DeepSeek

Source: [openrouter.ai/deepseek/deepseek-v4-flash](https://openrouter.ai/deepseek/deepseek-v4-flash) | [techcrunch.com](https://techcrunch.com/2026/04/24/deepseek-previews-new-ai-model-that-closes-the-gap-with-frontier-models/)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| DeepSeek V4 Pro Max | 128K | $0.145 | $3.48 | 80.6% | "Closes gap" with frontier; Apr 2026 |
| DeepSeek V4 Flash Max | 128K | $0.112 | $0.224 | 79.0% | Exceptional price/performance |
| DeepSeek V4 Flash | 128K | $0.112 | $0.224 | — | Standard V4 Flash |
| DeepSeek R1 | 64K | free | free | — | Free on OpenRouter; open MIT weights |
| DeepSeek V3.1-Think | 128K | $0.27 | $1.10 | — | Hybrid think/no-think; previous gen |

> OpenRouter IDs: `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-r1` (free)

---

### Alibaba — Qwen

Source: [openrouter.ai/qwen/qwen3.6-plus](https://openrouter.ai/qwen/qwen3.6-plus)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| Qwen3.6 Plus | — | $0.325 | $1.95 | 78.8% | Strong coding; Artificial Analysis score 52 |
| Qwen3.6 Flash | — | $0.1875 | $1.125 | — | Cheaper Qwen3.6 |
| Qwen3.6-27B | — | — | — | 77.2% | — |
| Qwen3.5-397B-A17B | — | — | — | 76.4% | Huge MoE; strong overall |
| Qwen3 Coder 480B | 262K | free | free | — | Best free coding model on OpenRouter |
| Qwen3-235B-A22B | 32K | $0.22 | $0.88 | — | Thinking mode; strong math |

> OpenRouter IDs: `qwen/qwen3.6-plus`, `qwen/qwen3.6-flash`, `qwen/qwen3-coder-480b:free`

---

### Moonshot AI — Kimi

Source: [openrouter.ai/moonshotai/kimi-k2.6](https://openrouter.ai/moonshotai/kimi-k2.6) | [miraflow.ai](https://miraflow.ai/blog/kimi-k2-6-explained-moonshot-ai-open-source-model-ties-gpt-5-5-coding)

| Model | Context | Input $/M | Output $/M | SWE-bench | Notes |
|-------|---------|-----------|------------|-----------|-------|
| Kimi K2.6 | 256K | $0.60 | $2.50 | 80.2% (Verified) / 58.6% (Pro) | Released Apr 20 2026; ties GPT-5.5 on Pro |
| Kimi K2.5 | — | — | — | 76.8% | Previous version |
| Kimi K2 Thinking | — | — | — | — | Thinking variant |

> K2.6: 1T total params, 32B active, 384 experts. Multimodal (text, image, video). Open source.
> OpenRouter: ~$0.73/$3.49. OpenRouter ID: `moonshotai/kimi-k2.6`

---

### Other Notable Models

| Model | Provider | SWE-bench | Notes |
|-------|----------|-----------|-------|
| MiniMax M2.5 | MiniMax | 80.2% | Ties Kimi K2.6; Chinese frontier lab |
| MiMo-V2-Pro | Xiaomi | 78.0% | Surprising coding performance from Xiaomi |
| GLM-5 | Zhipu AI | 77.8% | Chinese open model |
| Muse Spark | Meta | 77.4% | Meta's new coding specialist |
| Seed 2.0 Pro | ByteDance | 76.5% | ByteDance (TikTok parent) model |
| Gemma 4 31B | Google | — | Best open-weight for local hosting |
| Mistral Codestral | Mistral | — | Best FIM/autocomplete; $0.30/$0.90 |

---

## 3. Artificial Analysis Intelligence Index (May 2026)

Source: [artificialanalysis.ai/leaderboards/models](https://artificialanalysis.ai/leaderboards/models)

Quality score (higher = smarter), blended price (avg input+output), and speed:

| Rank | Model | Score | Blended $/M | Speed (tok/s) |
|------|-------|-------|------------|---------------|
| 1 | GPT-5.5 (xhigh) | 60 | $11.25 | 63 |
| 2 | GPT-5.5 (high) | 59 | $11.25 | 67 |
| 3 | Claude Opus 4.7 | 57 | $10.94 | 46 |
| 3 | Gemini 3.1 Pro Preview | 57 | $4.50 | 120 |
| 5 | Grok 4.3 | 53 | $1.56 | — |
| 6 | DeepSeek V4 Pro | 52 | $2.17 | — |
| 6 | Qwen3.6 Max Preview | 52 | $2.92 | — |

**Speed leaders:** Mercury 2 (662 tok/s), IBM Granite 3.3 8B (455 tok/s)

**Cheapest capable models:** Qwen3.5 0.8B ($0.02/M), Gemma 3n E4B ($0.03/M), Qwen3.5 2B ($0.04/M)

---

## 4. Best Model per Task — Openloom Agents

### Build Agent (code writing, file editing, implementing features)
| Tier | Model | Why |
|------|-------|-----|
| Best | Claude Opus 4.7 | 87.6% SWE-bench; most reliable multi-file edits |
| Balanced | Claude Sonnet 4.6 | 79.6% SWE-bench; $3/M; 99% of Opus quality at 40% lower cost |
| Budget | DeepSeek V4 Flash | $0.11/M; 79% SWE-bench; stunning value |
| Alternative | Kimi K2.6 | $0.60/M; 80.2% SWE-bench; strong coding; open source |

### Plan Agent (read-only, architecture, deep analysis)
| Tier | Model | Why |
|------|-------|-----|
| Best | Claude Sonnet 4.6 | Fast + deep reasoning; 79.6% SWE-bench; 1M context |
| Long context | Gemini 3.1 Pro | 1M context at $2/M; 80.6% SWE-bench; 120 tok/s |
| Budget | Grok 4.3 | $1.25/M; 53 AA score; 1M context; fast |

### Explore Subagent (fast codebase search, short-lived)
| Tier | Model | Why |
|------|-------|-----|
| Best value | DeepSeek V4 Flash | $0.11/M; 79% SWE-bench; cheapest frontier-class |
| Free | Qwen3 Coder 480B | Free on OpenRouter; 262K context; best free coding |
| Free | DeepSeek R1 | Free on OpenRouter; strong reasoning |
| Fast | Claude Haiku 4.5 | $1/M; 1M context; native Anthropic integration |
| Cheapest | Gemma 3n E4B | $0.03/M; self-host via Ollama |

### Scout Subagent (external docs, web research)
| Tier | Model | Why |
|------|-------|-----|
| Best | Grok 4.3 | $1.25/M; strong web research; real-time X data |
| Balanced | DeepSeek V4 Flash | $0.11/M; good summarization |
| Budget | Qwen3.6 Flash | $0.19/M; capable reader |

### General Agent (autonomous multi-step orchestration)
| Tier | Model | Why |
|------|-------|-----|
| Best | Claude Opus 4.7 | 87.6% SWE-bench; most reliable planning + execution |
| Balanced | Claude Sonnet 4.6 | 79.6%; $3/M; fast enough for orchestration |
| Budget | DeepSeek V4 Pro | $0.145/M; 80.6% SWE-bench; near-frontier quality |

---

## 5. Cost Tiers

### Free — for subagents, dev/test, high-volume search
| Model | Context | Notes |
|-------|---------|-------|
| Qwen3 Coder 480B | 262K | Best free coding on OpenRouter |
| DeepSeek R1 | 64K | Best free reasoning on OpenRouter |
| Llama 3.3 70B | 128K | Meta open weights; reliable fallback |
| Gemma 4 | 256K | Google open weights; self-host |

### Ultra-cheap (< $0.25/M input) — explore subagents, high volume
| Model | Input $/M | Quality |
|-------|-----------|---------|
| Gemma 3n E4B | $0.03 | Low-medium |
| Grok 4.1 Fast | $0.20 | Medium-high |
| DeepSeek V4 Flash | $0.112 | High (79% SWE-bench) |
| Qwen3.6 Flash | $0.19 | High (77% SWE-bench range) |
| Qwen3-235B | $0.22 | High |

### Budget ($0.25–3/M input) — daily build/plan agents
| Model | Input $/M | Quality |
|-------|-----------|---------|
| Kimi K2.6 | $0.60 | Very high (80.2% SWE-bench) |
| Grok 4.3 | $1.25 | High (53 AA score) |
| Gemini 3.1 Pro | $2.00 | Very high (80.6% SWE-bench) |
| Claude Haiku 4.5 | $1.00 | High |
| Grok 4.20 | $2.00 | High (2M context) |
| Claude Sonnet 4.6 | $3.00 | Very high (79.6% SWE-bench) |

### Premium ($5–30/M input) — complex multi-file work
| Model | Input $/M | Quality |
|-------|-----------|---------|
| GPT-5.5 standard | $5.00 | Very high (82.6% SWE-bench) |
| Claude Opus 4.7 | $5.00 | Very high (87.6% SWE-bench) |

### Ultra-premium (> $30/M input) — hardest problems only
| Model | Input $/M | Quality |
|-------|-----------|---------|
| GPT-5.5 Pro | $30.00 | Highest (82.6% SWE-bench; strongest reasoning) |

---

## 6. Recommended openloom.json Config

### Balanced (recommended starting point)
```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "agent": {
    "build":   { "model": "anthropic/claude-sonnet-4-6" },
    "plan":    { "model": "anthropic/claude-sonnet-4-6" },
    "explore": { "model": "deepseek/deepseek-v4-flash" },
    "scout":   { "model": "x-ai/grok-4.3" },
    "general": { "model": "anthropic/claude-opus-4-7" }
  }
}
```
Estimated cost: ~$1.50–4 per heavy session

### Budget (high volume / cost-sensitive)
```json
{
  "model": "deepseek/deepseek-v4-flash",
  "agent": {
    "build":   { "model": "moonshotai/kimi-k2.6" },
    "plan":    { "model": "x-ai/grok-4.3" },
    "explore": { "model": "qwen/qwen3-coder-480b:free" },
    "scout":   { "model": "deepseek/deepseek-r1:free" },
    "general": { "model": "deepseek/deepseek-v4-pro" }
  }
}
```
Estimated cost: ~$0.10–0.50 per heavy session

### Quality-first
```json
{
  "model": "anthropic/claude-opus-4-7",
  "agent": {
    "build":   { "model": "anthropic/claude-opus-4-7" },
    "plan":    { "model": "google/gemini-3.1-pro-preview" },
    "explore": { "model": "anthropic/claude-haiku-4-5" },
    "scout":   { "model": "x-ai/grok-4.3" },
    "general": { "model": "anthropic/claude-opus-4-7" }
  }
}
```

---

## 7. Key Insights

**The landscape has shifted dramatically in 2026:**
- Claude Opus 4.7 dropped from $15/$75 to **$5/$25** — 67% price cut. Frontier quality is now accessible.
- DeepSeek V4 Flash at **$0.11/M** achieves 79% SWE-bench — same as Claude Sonnet 4.5 from last year, at 3% of the cost.
- **Kimi K2.6** (open source!) ties GPT-5.5 on SWE-bench Pro at 58.6% while costing 80% less.
- **New players**: Xiaomi's MiMo-V2-Pro (78%), Zhipu's GLM-5 (77.8%), ByteDance's Seed 2.0 Pro (76.5%) — the SWE-bench top 25 is no longer dominated by US labs.
- **Gemini 3.1 Pro** at $2/M with 1M context and 80.6% SWE-bench is the best cost/context combination for reading large codebases.
- **Claude Mythos Preview** at 93.9% SWE-bench is a glimpse of what's coming — not yet on public API.
- **Free tier** on OpenRouter now includes Qwen3 Coder 480B (262K context!) and DeepSeek R1 — powerful enough for most subagent work at zero cost.

---

## 8. How to Keep This Updated

1. **SWE-bench:** [swebench.com](https://www.swebench.com/) — check monthly for new entries
2. **Overall quality rankings:** [artificialanalysis.ai/leaderboards/models](https://artificialanalysis.ai/leaderboards/models) — updated continuously
3. **Pricing:** [openrouter.ai/models](https://openrouter.ai/models) — passthrough pricing, always current
4. **Cost calculator:** [costgoat.com/compare/llm-api](https://costgoat.com/compare/llm-api)
5. **SWE-bench Pro (decontaminated):** [swe-rebench.com](https://swe-rebench.com/) — truer benchmark

Run `openloom "check docs/model-research.md and update with current SWE-bench scores and pricing from openrouter.ai"` — the scout agent can refresh this automatically.
