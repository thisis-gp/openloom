---
name: sparc-methodology
description: >
  Structured 5-phase development workflow: Specification → Pseudocode → Architecture → Refinement → Completion.
  Use when: new feature implementation, complex multi-file changes, architectural decisions, system redesign, unclear requirements.
  Skip when: simple bug fixes, single-file edits, documentation updates, configuration changes.
---

# SPARC Methodology

A structured approach that prevents rushing into code before the design is solid.

## Phase 1 — Specification

Define the problem before touching code.

- What exactly must this feature do? Write 3-5 acceptance criteria.
- What are the constraints? (performance, backwards compat, security)
- What are the edge cases?
- What is explicitly out of scope?

Output: a clear written spec you can hand to someone else.

## Phase 2 — Pseudocode

Write the logic in plain language before writing real code.

- Walk through the happy path step by step
- Identify where errors can occur
- Note which existing functions/modules you'll call
- Flag any parts you're uncertain about

Output: pseudocode block that the implementation phase will translate directly.

## Phase 3 — Architecture

Design the structure before implementing.

- Which files change? Which are new?
- What are the interfaces/types at the boundary?
- What are the data flows?
- Where are the integration points with existing code?

Use the Explore subagent to read existing patterns before deciding on structure. Mirror what's already there.

## Phase 4 — Refinement

Review the design before committing.

- Does the architecture match the spec?
- Are there simpler approaches?
- Have you introduced any unnecessary abstractions?
- Is the interface minimal and clear?

Challenge your own design. Prefer deleting complexity over adding it.

## Phase 5 — Completion

Implement, verify, ship.

- Implement following the design exactly — no scope creep
- Run typecheck, lint, and tests after each file change
- Verify every acceptance criterion from Phase 1 is met
- Update relevant docs/comments if the WHY is non-obvious

## Anti-patterns to Avoid

- Skipping to Phase 5 when requirements are unclear (leads to rework)
- Over-engineering in Phase 3 (YAGNI applies)
- Changing scope during Phase 5 (start over from Phase 1)
