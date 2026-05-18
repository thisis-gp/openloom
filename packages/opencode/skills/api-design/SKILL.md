---
name: api-design
description: >
  REST and TypeScript API design: resource modeling, versioning, error formats, authentication patterns, and OpenAPI documentation.
  Use when: designing a new REST endpoint, creating a TypeScript public interface, documenting an API contract.
  Skip when: internal functions with no external callers.
---

# API Design

## REST Resource Modeling

Resources are nouns, verbs are HTTP methods:

```
GET    /users          → list users
POST   /users          → create user
GET    /users/:id      → get user
PATCH  /users/:id      → update user (partial)
PUT    /users/:id      → replace user (full)
DELETE /users/:id      → delete user

GET    /users/:id/sessions   → list a user's sessions
DELETE /users/:id/sessions   → end all sessions
```

Never: `POST /createUser`, `GET /deleteUser?id=123`

## Status Codes

```
200 OK              — successful GET, PATCH, PUT
201 Created         — successful POST with resource created (include Location header)
204 No Content      — successful DELETE (no body)
400 Bad Request     — validation error (include field-level errors)
401 Unauthorized    — not authenticated
403 Forbidden       — authenticated but not authorized
404 Not Found       — resource doesn't exist
409 Conflict        — state conflict (duplicate, concurrent edit)
422 Unprocessable   — semantic error (business rule violation)
429 Too Many        — rate limited (include Retry-After header)
500 Internal        — server error (never leak internals)
```

## Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "email": "must be a valid email address",
      "age": "must be at least 18"
    }
  }
}
```

## TypeScript Interface Design

```typescript
// Prefer interfaces for public contracts (more readable in error messages)
export interface CreateUserInput {
  email: string
  name: string
  role?: "admin" | "member"   // optional with explicit union
}

// Use discriminated unions for operations that can fail
export type CreateUserResult =
  | { ok: true; user: User }
  | { ok: false; error: "EMAIL_TAKEN" | "INVALID_EMAIL" }

// Version breaking changes, not URLs
// v1: export interface User { name: string }
// v2: export interface User { firstName: string; lastName: string }
// Add a migration path, don't just break v1 callers
```

## Versioning

- URL versioning (`/v1/`, `/v2/`) for major breaking changes
- Additive changes (new optional fields) don't need a new version
- Deprecate first, remove after 2+ releases
- Document deprecations in the response headers: `Deprecation: true`

## Authentication Patterns

```
Bearer token in Authorization header (not query param, not cookie for APIs)
Authorization: Bearer <token>

For browser clients: HttpOnly secure cookie
For service-to-service: mTLS or signed JWTs with short expiry
```
