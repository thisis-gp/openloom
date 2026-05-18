---
name: refactor-workflow
description: >
  Safe refactoring process: understand before changing, maintain behavior, verify at each step.
  Use when: cleaning up technical debt, renaming/moving code, improving structure without changing behavior, reducing duplication.
  Skip when: you're also changing behavior — separate the refactor from the feature change.
---

# Refactor Workflow

**Rule 1:** Refactoring and behavior changes don't mix. Do one or the other in a commit, never both.

## Before Starting

1. Make sure you have test coverage for the code you're changing. If you don't, write the tests first.
2. Understand what the code does. Read it fully before moving anything.
3. Confirm the goal: what specific problem are you solving? "Make it cleaner" is not a goal. "Remove the 3 duplicated validation functions and consolidate into one" is.

## Safe Refactoring Moves

### Rename

Use your editor's rename-symbol, or grep + sed. Verify no string interpolation escaped the rename.

```bash
# Find all usages first
grep -rn "oldFunctionName" src/

# After rename, verify
bun run typecheck   # catches missed renames in TS
```

### Extract Function

Move a block of code into a named function. The original code becomes a call to the new function. Run tests after.

### Inline Function

If a function is only called once and its name adds no clarity, inline it. Delete the function.

### Move File/Module

1. Create new location with the same content
2. Update all imports (TS compiler will tell you what broke)
3. Delete old location

### Remove Duplication

1. Identify the two (or more) duplicated blocks
2. Create one generalized version
3. Replace all occurrences
4. Run tests

## Verification at Each Step

After every individual refactor move:
```bash
bun run typecheck
bun test
```

Don't accumulate multiple changes before verifying — you won't know which one broke it.

## Scope Control

Refactors have a way of expanding. If you notice something else that needs fixing, note it and finish the current refactor first. Don't let one refactor turn into a 2,000-line diff.

## Commit Pattern

```bash
# Small, focused commits
git commit -m "refactor: extract validateEmail into shared utility"
git commit -m "refactor: consolidate three duplicate payment validators"
git commit -m "refactor: rename UserCtx to UserContext throughout"
```

Each commit should be one logical refactor move that leaves the code in a clean intermediate state.
