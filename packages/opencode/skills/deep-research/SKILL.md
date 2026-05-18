---
name: deep-research
description: >
  Structured research methodology for technology decisions, library selection, competitive analysis, and architecture options.
  Use when: comparing libraries, evaluating a new technology, investigating a reported bug in a dependency, researching API behavior.
  Skip when: you need to write code (research first, then switch to agent-coder).
---

# Deep Research Skill

Research before deciding. Don't code based on assumptions about external systems.

## GOAP Research Pipeline

Goal-Oriented Action Planning: decompose → parallel search → synthesize → verify.

### Stage 1 — Decompose

Break the top-level question into independent sub-goals. Each sub-goal should be answerable on its own.

**Example — "Should we use BullMQ or pg-boss for job queues?"**
- Sub-goal A: What are BullMQ's reliability guarantees under crash?
- Sub-goal B: What are pg-boss's reliability guarantees under crash?
- Sub-goal C: What are the operational costs of Redis vs Postgres as queue backend?
- Sub-goal D: Are there known edge cases in either library at >1k jobs/sec?

Write these down before searching anything.

### Stage 2 — Parallel Search

Dispatch one subagent per sub-goal. Use the `explore` or `scout` agent.

```
Agent A → fetch BullMQ docs on job retention, failure handling
Agent B → fetch pg-boss docs on durable delivery, at-least-once
Agent C → search GitHub issues for BullMQ crash-recovery bugs
Agent D → clone pg-boss, read src/worker.ts for delivery semantics
```

Rules:
- All agents run in parallel
- Each agent answers exactly one sub-goal
- Use `scout` when you need to clone a repo; use `explore` for local codebase; use `WebSearch`/`WebFetch` for docs

### Stage 3 — Synthesize

Don't report what each agent said. Answer the original question:

| Dimension | BullMQ | pg-boss |
|-----------|--------|---------|
| Durability | Redis AOF required; at-least-once | Postgres ACID; exactly-once option |
| Ops burden | Redis cluster | Existing Postgres |
| Throughput | ~10k jobs/sec | ~1k jobs/sec |

**Verdict format:**
- **Decision**: YES / NO / IT DEPENDS (state condition)
- **Evidence**: 2-3 specific citations (file:line or URL + version)
- **Caveats**: what changes this answer (version, config, load)
- **Recommendation**: what to do, given this evidence

### Stage 4 — Verify

For any claim that drives an architectural decision, do a targeted follow-up:

1. Find the primary source (code, spec, official doc)
2. Note the version it applies to
3. Check for known exceptions or recent regressions

Dispatch a single verification agent with a targeted question, not a broad re-search.

---

## Source Hierarchy

Search in this order — stop when you have enough:

1. **Official docs** — `WebFetch` the official documentation page
2. **Source code** — use `scout` to clone and read actual implementation
3. **Changelog / release notes** — for behavior changes over versions
4. **GitHub issues** — for known bugs, edge cases, workarounds
5. **Benchmarks** — look for reproducible benchmark code, not marketing claims

Avoid: blog posts, Medium articles, Stack Overflow unless the answer links to official source.

---

## Document Findings

If the research informs an architectural decision, write a short ADR:

```markdown
# ADR-NNN: Use X instead of Y for Z

## Decision
We will use X for Z.

## Rationale
[Findings from research — cite sources with version]

## Consequences
[What gets easier, what gets harder]
```
