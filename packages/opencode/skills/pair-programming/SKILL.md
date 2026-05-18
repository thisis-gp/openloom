---
name: pair-programming
description: >
  Collaborative development mode: driver/navigator roles, live problem solving, shared context building.
  Use when: tackling a hard problem together, onboarding to unfamiliar code, exploring architecture options interactively.
---

# Pair Programming

## Roles

**Driver** — types the code, executes commands, stays focused on the current step.

**Navigator** — holds the big picture, spots mistakes, suggests direction, reads ahead.

Switch roles every 25-30 minutes, or when one person gets stuck.

## Session Setup

Before coding:
1. State the goal out loud: "We're adding the agent supplement system. Done when build agent gets its supplement loaded."
2. Agree on the approach: 5 minutes of design before any code
3. Set a time limit: "We have 1 hour"

## Driver Patterns

- Type what the navigator says, even if you disagree — speak up, then follow direction
- Verbalize what you're doing: "I'm adding the import at the top"
- Stop when stuck: don't silently stare — say "I'm not sure what to do next"

## Navigator Patterns

- Stay one step ahead: while driver implements step 3, you're thinking about step 4
- Catch typos and logic errors before they're committed
- Ask questions when something's unclear: "Why are we using `Effect.promise` here?"
- Redirect scope creep: "That's a good idea, let's note it and finish this first"

## When to Switch to Solo

Pair programming is expensive — two people on one task. Switch to solo when:
- The problem is well-understood and mechanical
- One person needs to deeply focus to understand something new
- Fatigue sets in (pair sessions max 90-120 minutes)

## AI Pair Programming (with Openloom)

When using Openloom as your pair:
- You are the navigator — define what you want, question the output
- Openloom is the driver — it types, runs, and reports
- Review every diff before accepting — you're responsible for what ships
- If Openloom's approach seems wrong, say so explicitly: "Stop. I want to understand why you chose X before we continue."
