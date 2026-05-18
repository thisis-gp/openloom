---
name: deep-research
description: >
  Structured research methodology for technology decisions, library selection, competitive analysis, and architecture options.
  Use when: comparing libraries, evaluating a new technology, investigating a reported bug in a dependency, researching API behavior.
  Skip when: you need to write code (research first, then switch to agent-coder).
---

# Deep Research Skill

Research before deciding. Don't code based on assumptions about external systems.

## Research Protocol

### 1. Define the Question

State the precise question before searching. Vague question = vague answer.

- Bad: "research Redis"
- Good: "What are the performance characteristics of Redis pub/sub at 10k messages/sec, and does it guarantee message ordering per channel?"

### 2. Source Hierarchy

Search in this order — stop when you have enough:

1. **Official docs** — `WebFetch` the official documentation page
2. **Source code** — use the scout agent to clone and read the actual implementation
3. **Changelog / release notes** — for understanding behavior changes over time
4. **GitHub issues** — for known bugs, edge cases, and workarounds
5. **Benchmarks** — look for reproducible benchmark code, not marketing claims

Avoid: blog posts, Medium articles, Stack Overflow (unless the answer links to official source).

### 2. Parallel Search

Dispatch multiple explore or scout subagents in parallel for independent questions:

```
Agent 1: fetch official Redis pub/sub documentation
Agent 2: fetch Redis GitHub issues tagged "ordering"
Agent 3: clone ioredis and read the pub/sub implementation
```

### 3. Verify Claims

For any claim that affects an architectural decision:

- Find the primary source (code, spec, or official doc)
- Note the version it applies to
- Check if there are known exceptions or edge cases

### 4. Synthesize — Not Summarize

Don't just report what you found. Answer the original question:

- Verdict: YES / NO / IT DEPENDS (and under what conditions)
- Evidence: 2-3 specific citations with file:line or URL
- Caveats: what could change this answer (version, load, config)
- Recommendation: what should we do, given this evidence?

### 5. Document Findings

If the research informs an architectural decision, write a short ADR:

```markdown
# ADR-NNN: Use X instead of Y for Z

## Decision
We will use X for Z.

## Rationale
[Findings from research]

## Consequences
[What gets easier, what gets harder]
```
