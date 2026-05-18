---
name: git-workflow
description: >
  Git best practices: branching, commit messages, PR hygiene, conflict resolution, and release tagging.
  Use when: starting a feature, writing a commit message, reviewing a PR, preparing a release, resolving merge conflicts.
---

# Git Workflow

## Branching

```
main / master    ← production-ready, protected
  └── dev        ← integration branch (optional)
       └── feat/short-description   ← feature branches
       └── fix/issue-description    ← bug fix branches
       └── chore/what-you-changed   ← maintenance
```

Branch names: kebab-case, no more than 5 words. `feat/add-agent-supplement-system` not `feature/AddAgentSupplementSystem`.

## Commit Messages

Format: `<type>: <what changed>` (imperative, present tense, max 72 chars)

```
feat: add explore supplement file with Slate awareness
fix: correct null dereference in session close hook
chore: update dependencies to latest patch versions
refactor: extract writeSessionMemory into standalone module
test: add integration tests for budget circuit breaker
docs: document SPARC methodology skill usage
```

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `ci`

One logical change per commit. If you need "and" to describe the commit, split it.

## Before Opening a PR

- [ ] Branch is up to date with target branch (`git rebase main`)
- [ ] All commits have clear messages
- [ ] No debug code, no leftover TODOs
- [ ] Tests pass locally
- [ ] Typecheck passes
- [ ] PR description explains WHAT changed and WHY (not HOW)

## Conflict Resolution

```bash
git fetch origin
git rebase origin/main

# For each conflict:
# 1. Open the file, read both sides carefully
# 2. Keep what's correct (might be both, might be yours, might be theirs)
# 3. git add <file>
# 4. git rebase --continue
```

Never use `git merge --ours` / `--theirs` blindly — you'll silently discard real changes.

## Undoing Things

```bash
# Undo last commit but keep changes staged
git reset --soft HEAD~1

# Discard all uncommitted changes (DESTRUCTIVE)
git checkout -- .

# Fix the last commit message
git commit --amend -m "correct message"

# Undo a pushed commit safely
git revert <sha>     # creates a new "undo" commit
```

## Release Tagging

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

Use semver: `MAJOR.MINOR.PATCH`. Breaking change = MAJOR, new feature = MINOR, bug fix = PATCH.
