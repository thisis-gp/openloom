---
name: tdd-workflow
description: >
  Test-Driven Development workflow: write failing test first, then implement just enough to pass, then refactor.
  Use when: adding new functionality, fixing a bug (write failing test first), building a new module.
  Skip when: exploratory spiking, writing infrastructure/config code, quick one-liners with obvious correctness.
---

# TDD Workflow

Write the test first. This forces you to design the interface before the implementation.

## The Cycle (Red → Green → Refactor)

### Red — Write a Failing Test

Before writing any production code, write a test that:
- Describes the behavior you want
- Calls the code as a user would call it
- Asserts the correct output

Run it. It must fail (because the code doesn't exist yet).

```typescript
// RED: test written, code doesn't exist yet
it("calculates 10% fee on payment amount", () => {
  const fee = calculateFee(100)
  expect(fee).toBe(10)
})
```

### Green — Write the Minimum Code to Pass

Write the simplest code that makes the test pass. No more.

```typescript
// GREEN: simplest possible implementation
export function calculateFee(amount: number): number {
  return amount * 0.1
}
```

Run the test. It must pass.

### Refactor — Clean Up

Now that you have a safety net (the passing test), clean up:
- Remove duplication
- Improve names
- Extract helpers if needed

Run the test again. It must still pass.

## Adding the Next Behavior

Write the next failing test. Repeat.

```typescript
// RED: new behavior — what if amount is negative?
it("throws when amount is negative", () => {
  expect(() => calculateFee(-10)).toThrow("InvalidAmount")
})
```

## TDD for Bug Fixes

1. Write a test that reproduces the bug (it fails)
2. Fix the code
3. The test passes
4. The bug is fixed AND you have a regression test

## Common Mistakes

- Writing many tests at once before any implementation (write one at a time)
- Writing the implementation first, then writing tests to pass it (you lose the design benefit)
- Testing internal implementation details instead of external behavior
- Making tests pass by special-casing the test input (write real code)
