---
name: systematic-debugging
description: >
  Root-cause debugging methodology. Find and fix the actual cause, not the symptom.
  Use when: unexpected behavior, failing tests, runtime errors, performance regressions, intermittent bugs.
  Skip when: you already know the root cause and just need to implement the fix.
---

# Systematic Debugging

Do not touch code until you know what's wrong. Guessing wastes time.

## Step 1 — Reproduce

First, reproduce the bug reliably.

- What exact input triggers it?
- Does it happen every time or intermittently?
- What environment / version / OS?
- Can you write a failing test that captures it?

A bug you can reproduce reliably is 80% fixed.

## Step 2 — Understand the Expected vs Actual

State clearly:
- **Expected:** what should happen
- **Actual:** what happens instead
- **Delta:** what changed recently (git log, new dependency, config change)

## Step 3 — Narrow the Search Space

Use binary search on the problem:
- Add a log/breakpoint in the middle of the call chain
- Is the bug before or after that point?
- Repeat until you've isolated a single function or line

Tools:
```bash
git bisect start
git bisect bad          # current commit is broken
git bisect good <sha>   # this commit was good
# git will check out commits to test
git bisect good/bad     # mark each one until it finds the regression
```

## Step 4 — Form a Hypothesis

State your hypothesis precisely:
> "I believe the bug is in `processPayment` because `amount` is being passed as a string from the API layer, causing `amount * 0.1` to produce NaN."

Test it by reading the code, not by changing it.

## Step 5 — Verify Before Fixing

Confirm your hypothesis:
- Add a targeted log to see the actual value at the bug site
- Write a unit test that fails with the current code and would pass with the fix

## Step 6 — Fix the Root Cause

Fix the actual root cause, not the symptom.

```typescript
// SYMPTOM FIX (bad): mask the NaN
const fee = isNaN(amount * 0.1) ? 0 : amount * 0.1

// ROOT CAUSE FIX (good): parse the string at the boundary
const amount = Number(req.body.amount)
if (isNaN(amount) || amount <= 0) throw new ValidationError("Invalid amount")
```

## Step 7 — Verify the Fix

- Your reproduction test now passes
- No existing tests broke
- The fix is in the right layer (validate at the boundary, not deep inside)
