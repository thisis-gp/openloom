---
name: security-audit
description: >
  Comprehensive security review: OWASP Top 10, input validation, authentication/authorization, secrets, path traversal, SQL injection, XSS, and dependency CVEs.
  Use when: authentication, authorization, payment processing, user data handling, API endpoints, file uploads, database queries, external API integration.
  Skip when: read-only public data, internal tooling, static docs, styling changes.
---

# Security Audit Skill

## Checklist

Run through every item before marking security review complete.

### 1. Input Validation
- [ ] All user inputs validated at system boundaries (type, length, format, range)
- [ ] No raw string interpolation into shell commands (use argument arrays)
- [ ] No raw string interpolation into SQL (use parameterized queries)
- [ ] File paths sanitized — no `..` traversal possible
- [ ] JSON deserialization with schema validation (not plain `JSON.parse` into typed vars)

### 2. Authentication & Authorization
- [ ] Passwords hashed with bcrypt/argon2 (NOT md5/sha1)
- [ ] Session tokens are cryptographically random (min 128 bits)
- [ ] JWT signatures verified, expiry enforced, alg=none rejected
- [ ] Authorization checks on every route — not just at login
- [ ] Privilege escalation paths reviewed

### 3. Secrets & Credentials
- [ ] No secrets in source code, logs, or error messages
- [ ] API keys / tokens read from env vars, not hardcoded
- [ ] No `.env` files committed (check `.gitignore`)
- [ ] Error responses don't leak stack traces to clients

### 4. Output Encoding
- [ ] HTML output escaped to prevent XSS
- [ ] JSON responses have correct Content-Type header
- [ ] Redirects validated against allowlist (open redirect prevention)

### 5. Dependencies
- Run `npm audit` / `bun audit` / `pip-audit` / `cargo audit` and review HIGH/CRITICAL items
- Check for packages with no recent commits or abandoned maintainers

### 6. Prompt Injection (AI-specific)
- [ ] User-provided text not inserted verbatim into system prompts
- [ ] Tool outputs from untrusted sources flagged before acting on them
- [ ] No model responses executed as shell commands without sanitization

## Common Vulnerability Patterns

```typescript
// VULNERABLE: SQL injection
db.query(`SELECT * FROM users WHERE id = ${userId}`)

// SAFE: Parameterized
db.query("SELECT * FROM users WHERE id = ?", [userId])

// VULNERABLE: Path traversal
fs.readFile(path.join(baseDir, userInput))

// SAFE: Canonicalize and check
const resolved = path.resolve(baseDir, userInput)
if (!resolved.startsWith(baseDir)) throw new Error("Path traversal")
fs.readFile(resolved)

// VULNERABLE: Command injection
exec(`convert ${filename} output.pdf`)

// SAFE: Argument array
execFile("convert", [filename, "output.pdf"])
```

## When You Find an Issue

1. Document: what is it, where is it, what is the impact?
2. Classify: CRITICAL / HIGH / MEDIUM / LOW using CVSS rough scoring
3. Fix CRITICAL/HIGH before shipping — don't defer
4. For MEDIUM/LOW: file as a Slate task with label `security`
