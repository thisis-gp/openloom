---
name: slate-task-manager
description: >
  Slate task lifecycle management: loading task context, updating status, adding comments, creating subtasks.
  Use when: starting work on a Slate task, updating task progress, closing completed work, breaking a task into subtasks.
---

# Slate Task Manager

Slate is the task tracker for this workspace. Always load task context before starting work.

## Task Lifecycle

### Starting Work

```bash
# Load full task context
slate task show <ID>

# Check for subtasks
slate task list --parent <ID>

# Mark in progress
slate task update <ID> --status in_progress
```

Read the acceptance criteria carefully. If they're unclear, ask before starting.

### During Work

Add progress comments as you complete significant milestones:

```bash
slate task comment <ID> "Completed the DB schema. Starting API layer."
```

If you discover the task is larger than estimated, add a comment and create subtasks:

```bash
slate task create --title "Write migration for users table" --parent <ID>
slate task create --title "Implement user repository" --parent <ID>
slate task create --title "Add API endpoints" --parent <ID>
```

### Completing Work

Before marking done, verify every acceptance criterion:

```bash
# Check the criteria again
slate task show <ID>

# Verify all subtasks are done
slate task list --parent <ID> --status pending   # should be empty

# Mark complete with a summary comment
slate task comment <ID> "Done. All acceptance criteria met. Typecheck + tests passing."
slate task update <ID> --status done
```

### Blocking Issues

If you're blocked:

```bash
slate task comment <ID> "BLOCKED: need access to the prod DB to verify migration behavior. Waiting on @devops."
slate task update <ID> --status blocked
```

## Task Queries

```bash
# All in-progress tasks
slate task list --status in_progress

# My tasks
slate task list --assignee me

# Tasks in a project
slate task list --project <PROJECT_ID>

# Search
slate task search "auth flow"
```

## Task Fields

| Field | Values |
|---|---|
| status | pending, in_progress, done, blocked, cancelled |
| priority | low, medium, high, urgent |
| assignee | user handle or "me" |
| parent | parent task ID (for subtasks) |
