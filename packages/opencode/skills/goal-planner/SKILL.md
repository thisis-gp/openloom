---
name: goal-planner
description: >
  Goal-Oriented Action Planning (GOAP): decompose a plain-English goal into a concrete, ordered action plan using A* reasoning over preconditions and effects.
  Use when: complex feature planning, multi-phase project planning, unclear how to get from current state to desired state.
  Skip when: the path is already clear and you just need to execute it.
---

# Goal Planner (GOAP)

Translate a high-level goal into an ordered sequence of concrete actions by reasoning about preconditions and effects.

## Step 1 — Define the World State

What is true RIGHT NOW?

```
Current State:
- No auth system exists
- Users table has no password field  
- Session table has no user_id field
- No JWT library is installed
```

What should be true when DONE?

```
Goal State:
- Users can register with email + password
- Users can log in and receive a JWT
- Protected routes check the JWT
- Tests cover happy path + invalid credentials
```

## Step 2 — Enumerate Available Actions

List what you can do, with preconditions and effects:

| Action | Preconditions | Effects |
|--------|--------------|---------|
| Add password to users table | users table exists | users.password_hash exists |
| Add JWT library | package.json exists | jsonwebtoken available |
| Write UserAuth service | password field exists, JWT lib available | auth service exists |
| Write login endpoint | auth service exists | POST /login works |
| Write JWT middleware | auth service exists | JWT verification works |
| Protect routes | JWT middleware exists | routes require auth |
| Write auth tests | login endpoint exists | tests exist |

## Step 3 — A* Path Search

Find the shortest path from Current State to Goal State:

```
START: no auth
  → Add password field (satisfies: password field exists)
  → Add JWT library (satisfies: JWT lib available)
  → Write UserAuth service (preconditions now met)
  → Write login endpoint (preconditions now met)
  → Write JWT middleware (preconditions now met)
  → Protect routes (preconditions now met)
  → Write tests (preconditions now met)
GOAL: auth system complete ✓
```

## Step 4 — Validate the Plan

Before executing:
- Is each action atomic (can be done in one step)?
- Is the ordering correct (all preconditions met before each action)?
- Are there parallel opportunities? (JWT lib install can overlap with schema work)
- What are the risks? (What if a precondition can't be satisfied?)

## Step 5 — Execute with OODA Loop

During execution, apply the OODA loop at each action:
- **Observe**: what did the last action actually produce?
- **Orient**: does the current state still match your plan's assumption?
- **Decide**: should you proceed, adjust, or replan?
- **Act**: execute the next action

If an action produces unexpected results → replan from the new current state.

## Output Format

Produce the plan as a numbered task list, then execute it:

```
1. [ ] Add password_hash column to users table (migration)
2. [ ] Install jsonwebtoken + @types/jsonwebtoken
3. [ ] Implement UserAuth.register() + UserAuth.login()
4. [ ] Implement POST /auth/register and POST /auth/login endpoints
5. [ ] Implement verifyToken() JWT middleware
6. [ ] Apply middleware to protected routes
7. [ ] Write integration tests for auth flow
```

Mark each item done as you complete it. Replan if any item hits an unexpected blocker.
