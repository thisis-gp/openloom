---
name: code-review-workflow
description: >
  Structured code review process for both reviewer and author. Covers pre-review checklist, review execution, and responding to feedback.
  Use when: reviewing someone else's code, preparing your own code for review, responding to review comments.
---

# Code Review Workflow

## For Authors — Before Requesting Review

Self-review your own diff first:

```bash
git diff main...HEAD
```

Check:
- [ ] No debug code or `console.log` left in
- [ ] No leftover TODO/FIXME without a linked issue
- [ ] Commit messages are clean and follow the project convention
- [ ] Tests cover the new behavior
- [ ] Typecheck passes: `bun run typecheck`
- [ ] Lint passes: `bun run lint`
- [ ] PR description explains WHY this change exists (not just WHAT)

If you'd be embarrassed to show your reviewer a particular piece of code, clean it up first.

## For Reviewers — Review Execution

### First Pass (5 minutes)

Read the PR description and the list of changed files. Understand the intent before reading the code.

### Second Pass — Correctness

Read the code carefully:
- Does it do what the description says?
- What happens on error paths?
- Are there race conditions or ordering assumptions?
- Does it handle nil/null/undefined?

### Third Pass — Design

- Is this the right abstraction level?
- Is it consistent with surrounding code?
- Will this be maintainable in a year?

### Output Format

Use standard comment prefixes so the author knows urgency:

- `[MUST]` — Correctness or security issue. Must be fixed before merge.
- `[SHOULD]` — Important quality issue. Fix unless there's a good reason not to.
- `[NIT]` — Style/minor preference. Author's call.
- `[QUESTION]` — I don't understand this. Explain or simplify.
- `[PRAISE]` — Good pattern I want to acknowledge.

Example:
```
[MUST] Line 47: userId is passed directly into the SQL query string.
       Use a parameterized query to prevent SQL injection.

[SHOULD] The error from getUserById is swallowed. At minimum log it.

[NIT] `getU` → `getUser` for readability.

[PRAISE] Good use of early returns instead of deep nesting.
```

## For Authors — Responding to Feedback

- For `[MUST]` / `[SHOULD]`: Fix it and reply "Done" with the commit SHA
- For `[NIT]`: Acknowledge and either fix or explain why you didn't
- For `[QUESTION]`: Either simplify the code so it's self-explanatory, or add a comment explaining the WHY
- Don't take feedback personally — it's about the code, not you
- If you disagree with a `[MUST]`, say so clearly with reasoning — don't silently not fix it
