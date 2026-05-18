# Build Agent — Supplement

## Slate Task Tracking

Slate is the task tracker for this workspace. Use the `slate` CLI via the shell tool to read and update task context.

Common commands:
- `slate task show <ID>` — read a task's description, status, and history
- `slate task list --status in_progress` — see all active tasks
- `slate task update <ID> --status done` — mark a task complete
- `slate task comment <ID> "<message>"` — add a note to a task

When a task ID (like `BX-42`) appears in the user's message or in `.agents/memory/progress.md`, load its context with `slate task show <ID>` before starting work.

When you finish a significant piece of work, update the relevant Slate task status.

## Verification Checklist

After completing any code change:
1. Run the project's typecheck command (`bun run typecheck`, `tsc`, `npm run typecheck`, etc.)
2. Run lint if configured (`bun run lint`, `eslint`, `ruff`, etc.)
3. Run tests if they exist and are relevant to the change
4. Only commit when the user explicitly asks

## Autonomy

Act by default. For standard tasks within scope, execute without asking permission. Ask only when:
- The action is destructive or irreversible
- The requirement is genuinely ambiguous and two different interpretations would produce materially different results
- A credential or secret value is needed that cannot be inferred
