---
name: swarm-orchestration
description: >
  Multi-agent swarm coordination using Openloom's Agent tool. Dispatch specialized subagents in parallel, coordinate results, maintain coherent output.
  Use when: 3+ files need changes, new feature implementation, cross-module refactoring, tasks with genuinely independent work streams.
  Skip when: single file edits, simple bug fixes, quick exploration, tasks that are tightly sequential.
---

# Swarm Orchestration

Openloom's Agent tool lets you dispatch multiple specialized subagents in parallel. This is the foundation of swarm coordination.

## When to Swarm

Swarm when the work has **independent parallel streams**. Don't swarm when everything must be done in sequence.

Good for swarming:
- "Implement feature X" → coder agent + tester agent in sequence, but you can parallelize subcomponents
- "Audit the security of modules A, B, and C" → 3 parallel explore agents
- "Refactor and write tests for 5 files" → dispatch per-file, collect results

Not worth swarming:
- "Fix the bug on line 47" — just do it
- "Add a field to the DB schema" — migrations are sequential

## Swarm Topologies

### Hierarchical (Recommended Default)

You are the Queen coordinator. You spawn workers, collect results, synthesize.

```
[You — Coordinator]
  ├── Agent: explore codebase for auth patterns
  ├── Agent: explore codebase for test patterns
  └── Agent: scout external lib docs
         ↓ (collect all results)
  └── Agent: coder — implement auth (with findings as context)
         ↓
  └── Agent: tester — write tests (with implementation as context)
```

### Parallel Fan-Out → Reduce

```
[You]
  ├── Agent: implement UserService
  ├── Agent: implement SessionService  
  └── Agent: implement AuthService
         ↓ (all complete)
  └── Agent: integration review (read all three, check consistency)
```

## Dispatch Protocol

When dispatching each subagent:

1. **Never assume context** — the subagent starts cold. Give it everything it needs:
   - The goal in one sentence
   - Relevant file paths (don't make it search for what you already know)
   - The exact spec/acceptance criteria
   - What NOT to do (scope constraints)

2. **Specify the deliverable** — "Return: list of file paths and their current auth patterns" not "research auth"

3. **Collect and synthesize** — read each agent's output, extract the key findings, then make decisions yourself. Don't just chain agents blindly.

## Coordination Checklist

Before dispatching:
- [ ] Can this work stream truly run in parallel? (No shared writes to same file)
- [ ] Does each agent have enough context to complete its task without asking?
- [ ] Do I know how I'll synthesize their outputs?

After collecting:
- [ ] Did any agent report a blocker or uncertainty?
- [ ] Are the outputs consistent with each other?
- [ ] Do I need a review pass before using the outputs?

## Anti-Patterns

- Dispatching agents to the same file in parallel (merge conflicts)
- Giving agents vague tasks ("research the codebase") instead of precise deliverables
- Not reading agent outputs before moving to the next step
- Swarms for simple tasks (overhead > benefit)
