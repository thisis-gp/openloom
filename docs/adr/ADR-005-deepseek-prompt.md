# ADR-005: Separate prompt file for DeepSeek/Qwen models

**Status:** Accepted

## Context

The `provider()` function in `system.ts` selects a base system prompt based on the model ID. DeepSeek (V3, V4, R1) and Qwen/QwQ models were previously falling through to `default.txt`. These models have different instruction-following characteristics than Claude (verbose, structured) or GPT-4 (autonomous).

## Decision

Create `src/session/prompt/deepseek.txt` — a concise, direct prompt that emphasizes:
- Short output, no preamble/postamble
- Explicit parallelism instructions (batch tool calls)
- Convention-following over library assumption
- Security best practices

Route `deepseek`, `qwen`, `qwq` model IDs to this prompt in `provider()`.

## Rationale

DeepSeek and Qwen models respond well to explicit, terse instructions. The anthropic.txt prompt is tuned for Claude's style (TodoWrite, task tracking, parallel tools in XML format). The default.txt is too generic. A dedicated prompt extracts better behavior from these models for the openloom use case.

## Consequences

**Easier:** Users who configure DeepSeek V4 Flash (cheapest capable model at $0.11/M) get a tuned experience.

**Harder:** One more prompt file to maintain when these models update their instruction-following behavior.
