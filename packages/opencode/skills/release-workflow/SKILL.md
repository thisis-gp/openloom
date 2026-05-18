---
name: release-workflow
description: >
  Release process: version bumping, changelog generation, tagging, and publishing.
  Use when: preparing a release, creating a changelog, bumping versions, publishing to npm or other registries.
---

# Release Workflow

## Versioning (Semver)

```
MAJOR.MINOR.PATCH

MAJOR  Breaking change — existing callers must update
MINOR  New feature, backwards compatible
PATCH  Bug fix, backwards compatible
```

Pre-release: `1.2.3-alpha.1`, `1.2.3-beta.4`, `1.2.3-rc.1`

## Release Checklist

### Pre-release

- [ ] All intended PRs merged to main
- [ ] Tests passing on main: `bun test`
- [ ] Typecheck clean: `bun run typecheck`
- [ ] `CHANGELOG.md` updated (see below)
- [ ] Version bumped in `package.json` (and `packages/*/package.json` if monorepo)

### Changelog Format

```markdown
# Changelog

## [1.3.0] — 2026-05-18

### Added
- Explore supplement file with Slate awareness (#42)
- SQLite memory table for session history (#45)

### Changed
- Provider() now routes gpt-5 to BEAST prompt (#47)

### Fixed
- Session close hook no longer crashes when DB is uninitialised (#48)

### Removed
- Deprecated `tools` field in agent config (use `permission` instead)
```

### Tagging and Publishing

```bash
# Bump version
npm version minor   # or major / patch

# This auto-commits package.json and tags:
# Commit: "v1.3.0"
# Tag: v1.3.0

# Push with tags
git push origin main --tags

# Publish to npm
npm publish
# or for monorepo
bun run publish
```

### Post-release

- [ ] GitHub Release created from the tag (paste changelog section)
- [ ] Slack/Discord announcement if applicable
- [ ] Slate tasks for this release marked done
- [ ] Update `docs/` if any public interfaces changed

## Hotfix Process

For critical bugs in production:

```bash
git checkout -b hotfix/v1.2.4 v1.2.3   # branch from the tag
# make the fix
# bump patch version
git commit -m "fix: critical null pointer in session close"
npm version patch
git push origin hotfix/v1.2.4 --tags
# Merge back to main AND dev/next branch
```
