# Fix All Issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all 108 TypeScript errors, reduce meaningful `any` usage, and improve code quality across packages/opencode.

**Architecture:** Four independent phases. Phase 1 (service layer fixes) unblocks everything else. Phase 2 (CLI type fixes) and Phase 3 (type safety) run after Phase 1. Phase 4 (structural) is a separate long-running effort.

**Tech Stack:** TypeScript, Effect-ts, Bun, SQLite/Drizzle

**Commands:**
- Typecheck: `bun run typecheck` (from `packages/opencode/`)
- Tests: `bun test` (from `packages/opencode/`)

---

## Phase 1: Fix Service Layer Leaks (Root Cause of ~60 errors)

The new `MemoryLayer` (VectorService, GraphService, CuratorService) is wired into `ToolRegistry.layer` but NOT added to `AppLayer`. This causes every Effect that yields `ToolRegistry.Service` to carry the memory service requirements, which then appear as unresolved `Service` in function signatures. Fix the root first — many downstream errors will clear automatically.

### Task 1: Add MemoryLayer to AppLayer

**Files:**
- Modify: `src/effect/app-runtime.ts:61-119`

- [ ] **Step 1: Verify the missing import**

Run:
```bash
grep -n "MemoryLayer\|VectorService\|GraphService\|CuratorService" src/effect/app-runtime.ts
```
Expected: no output (confirming these are absent)

- [ ] **Step 2: Add MemoryLayer import and include it in AppLayer**

In `src/effect/app-runtime.ts`, add after the CronService import at line 61:
```typescript
import { MemoryLayer } from "@/memory/index"
```

Then in `AppLayer` (after `CronService.layer` at line 96), add:
```typescript
  MemoryLayer,
```

Full block should look like:
```typescript
import { CronService } from "@/cron/cron"
import { MemoryLayer } from "@/memory/index"

export const AppLayer = Layer.mergeAll(
  // ... existing layers ...
  CronService.layer,
  MemoryLayer,
  // ... rest ...
)
```

- [ ] **Step 3: Run typecheck and count remaining errors**

```bash
bun run typecheck 2>&1 | grep "error TS" | wc -l
```
Expected: fewer than 108 (likely drops to ~60-70)

- [ ] **Step 4: Commit**

```bash
git add src/effect/app-runtime.ts
git commit -m "fix: add MemoryLayer to AppLayer to satisfy service requirements"
```

---

### Task 2: Fix CuratorService VectorDeps Leak

**Files:**
- Modify: `src/memory/curator/curator.ts:55-120`

The `run` method inside CuratorService.layer's Effect returns an inner `Effect.gen` that still yields `VectorService.Service` and `GraphService.Service` from context. Since these are captured as `Option` values at layer construction time, the inner effects should use the already-resolved `vectorOpt`/`graphOpt` closures — not yield from context again.

- [ ] **Step 1: Read the full run method**

```bash
sed -n '36,200p' src/memory/curator/curator.ts
```

- [ ] **Step 2: Locate where VectorService/GraphService are re-yielded inside run**

```bash
grep -n "yield\* VectorService\|yield\* GraphService\|VectorService.Service\|GraphService.Service" src/memory/curator/curator.ts
```

- [ ] **Step 3: Replace context yields with captured closure values**

Any `yield* VectorService.Service` inside the `run` method body should be replaced with `vectorOpt` (the `Option` captured at construction time). Wrap usage in `Option.match`:

Pattern to replace:
```typescript
const vector = yield* VectorService.Service
vector.someMethod(...)
```

Replace with (using captured closure):
```typescript
// vectorOpt is already captured as Option<VectorService.Interface> above
Option.match(vectorOpt, {
  onNone: () => Effect.void,
  onSome: (vector) => vector.someMethod(...),
})
```

- [ ] **Step 4: Verify the layer type annotation still holds**

The layer type `Layer.Layer<Service, never, VectorService.Service | GraphService.Service>` is correct because the layer REQUIRES them (for Effect.serviceOption). Keep this type annotation.

The `run` method's return type should now be `Effect<..., never, never>` with no service requirements.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "curator.ts"
```
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/memory/curator/curator.ts
git commit -m "fix: close VectorDeps leak in CuratorService run method"
```

---

### Task 3: Fix fence.ts and cron.ts Service Leaks

**Files:**
- Modify: `src/server/shared/fence.ts:70-80`
- Modify: `src/cron/cron.ts:205-215`

- [ ] **Step 1: Check fence.ts error**

```bash
bun run typecheck 2>&1 | grep "fence.ts"
```

Read the offending line:
```bash
sed -n '68,80p' src/server/shared/fence.ts
```

- [ ] **Step 2: Fix fence.ts — provide missing service inline**

The error is: `Effect<void, WaitForSyncError, Service>` is not assignable to `Effect<void, WaitForSyncError, never>`. The fix is to ensure the service is provided before passing to the function. Look at what `Service` is required and provide it via `Effect.provide` or check if it should be in the function's scope.

Pattern:
```typescript
// If the Effect requires SomeService that's available as a local variable `svc`:
someEffect.pipe(Effect.provideService(SomeService, svc))
```

- [ ] **Step 3: Check cron.ts error**

```bash
bun run typecheck 2>&1 | grep "cron.ts"
```

Read the offending line:
```bash
sed -n '203,215p' src/cron/cron.ts
```

The error is a type conversion issue: `Conversion of type 'Effect<string, never, Service>' to type 'Effect<string, unknown, never>'`. This is likely an `as` cast that's incorrect. Replace with a proper `Effect.provideService` or restructure to avoid the cast.

- [ ] **Step 4: Run typecheck on both files**

```bash
bun run typecheck 2>&1 | grep "fence.ts\|cron.ts"
```
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/server/shared/fence.ts src/cron/cron.ts
git commit -m "fix: resolve service requirement leaks in fence and cron"
```

---

### Task 4: Fix session_search.ts Tool Registration Error

**Files:**
- Modify: `src/tool/session_search.ts:225-235`

- [ ] **Step 1: Read the error context**

```bash
bun run typecheck 2>&1 | grep "session_search.ts"
sed -n '220,240p' src/tool/session_search.ts
```

The error is that a Tool `Effect` with service requirements is being passed to a function expecting `Effect<..., never, never>`. The tool definition's `execute` function or `init` is returning an Effect that leaks service requirements.

- [ ] **Step 2: Identify what service is leaked**

Look at what the `execute` or `init` function yields. If it yields a service that should already be provided by the Tool infrastructure, check if that service is missing from the Tool's layer provider.

- [ ] **Step 3: Apply the fix**

Option A — if the service is available in the Tool context, ensure it's captured before returning:
```typescript
// Instead of:
execute: (params) => Effect.gen(function* () {
  const svc = yield* SomeService  // leaks SomeService
  return svc.doSomething(params)
})

// Use:
execute: (params) => Effect.gen(function* () {
  const result = yield* Effect.provideService(
    svc.doSomething(params),
    SomeService,
    capturedSvc  // captured in outer scope
  )
  return result
})
```

Option B — add the required service to the Tool's provided layer list (wherever SessionSearchTool is registered in registry.ts).

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "session_search.ts"
```
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/tool/session_search.ts
git commit -m "fix: resolve service leak in SessionSearch tool registration"
```

---

### Task 5: Fix acp/runtime.ts and project/instance-runtime.ts

**Files:**
- Modify: `src/acp/runtime.ts:15-25`
- Modify: `src/project/instance-runtime.ts` (check error line)

- [ ] **Step 1: Check errors**

```bash
bun run typecheck 2>&1 | grep "acp/runtime.ts\|instance-runtime.ts"
sed -n '15,30p' src/acp/runtime.ts
```

- [ ] **Step 2: Fix the service requirement**

The error is `Effect<InstanceContext, never, Service>` not assignable to `Effect<InstanceContext, never, never>`. The fix is to provide the required service in scope:
```typescript
// Find what Service is required, then provide it:
someEffect.pipe(
  Effect.provideService(SomeService, someServiceImpl)
)
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "acp/runtime.ts\|instance-runtime.ts"
```
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/acp/runtime.ts src/project/instance-runtime.ts
git commit -m "fix: provide missing services in acp and instance runtimes"
```

---

## Phase 2: Fix CLI Command Handler Type Signatures (~30 errors across 20 files)

The `effectCmd` expects handlers typed as `(args: WithDoubleDash<Args>) => Effect<A, CliError, AppServices | InstanceStore.Service>`. Many handlers use `(args: any)` or `function* ()` (no args), causing TypeScript failures. The fix is consistent: explicitly type args using the inferred generic, and change `any` args to `_args` when unused.

### Task 6: Fix CLI handler signatures — account, agent, acp, export, import, models

**Files:**
- Modify: `src/cli/cmd/account.ts`
- Modify: `src/cli/cmd/agent.ts`
- Modify: `src/cli/cmd/acp.ts`
- Modify: `src/cli/cmd/export.ts`
- Modify: `src/cli/cmd/import.ts`
- Modify: `src/cli/cmd/models.ts`

- [ ] **Step 1: Check each file's error lines**

```bash
bun run typecheck 2>&1 | grep "account.ts\|/agent.ts\|acp.ts\|export.ts\|import.ts\|models.ts"
```

- [ ] **Step 2: Fix account.ts — handlers with no args**

For handlers that ignore args (like `SwitchCommand`, `OrgsCommand`, `OpenCommand`), change from:
```typescript
handler: Effect.fn("Cli.account.switch")(function* () {
```
To:
```typescript
handler: Effect.fn("Cli.account.switch")(function* (_args) {
```

For handlers that use `args: any` with typed positionals (like `LoginCommand`), explicitly type:
```typescript
// LoginCommand builder returns yargs with positional "url: string"
handler: Effect.fn("Cli.account.login")(function* (args: { url: string }) {
```

- [ ] **Step 3: Apply same pattern across all 6 files**

For each file, identify handlers with `function* ()` (no args) → add `_args`, and handlers with `function* (args)` that resolve to `any` → add explicit arg type matching the builder's positionals.

Pattern reference:
```typescript
// No args needed → use _args
handler: Effect.fn("Cli.xxx")(function* (_args) { ... })

// Args needed, typed from builder
handler: Effect.fn("Cli.xxx")(function* (args: WithDoubleDash<{ name: string }>) { ... })
```

Import `WithDoubleDash` if not already imported:
```typescript
import { type WithDoubleDash } from "../cmd/cmd"
```

- [ ] **Step 4: Run typecheck on these files**

```bash
bun run typecheck 2>&1 | grep "account.ts\|/agent.ts\|acp.ts\|export.ts\|import.ts\|models.ts"
```
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/cli/cmd/account.ts src/cli/cmd/agent.ts src/cli/cmd/acp.ts \
        src/cli/cmd/export.ts src/cli/cmd/import.ts src/cli/cmd/models.ts
git commit -m "fix: type CLI command handler args in account, agent, acp, export, import, models"
```

---

### Task 7: Fix CLI handler signatures — debug/, github, mcp, pr, providers, run, serve, session, stats, tui/worker, web, upgrade

**Files:**
- Modify: `src/cli/cmd/debug/agent.ts`
- Modify: `src/cli/cmd/debug/config.ts`
- Modify: `src/cli/cmd/debug/file.ts`
- Modify: `src/cli/cmd/debug/index.ts`
- Modify: `src/cli/cmd/debug/lsp.ts`
- Modify: `src/cli/cmd/debug/ripgrep.ts`
- Modify: `src/cli/cmd/debug/skill.ts`
- Modify: `src/cli/cmd/debug/snapshot.ts`
- Modify: `src/cli/cmd/github.ts`
- Modify: `src/cli/cmd/mcp.ts`
- Modify: `src/cli/cmd/pr.ts`
- Modify: `src/cli/cmd/providers.ts`
- Modify: `src/cli/cmd/run.ts`
- Modify: `src/cli/cmd/serve.ts`
- Modify: `src/cli/cmd/session.ts`
- Modify: `src/cli/cmd/stats.ts`
- Modify: `src/cli/cmd/tui/worker.ts`
- Modify: `src/cli/cmd/web.ts`
- Modify: `src/cli/upgrade.ts`
- Modify: `src/control-plane/adapters/worktree.ts`

- [ ] **Step 1: Get all error lines for these files**

```bash
bun run typecheck 2>&1 | grep "debug/\|github.ts\|/mcp.ts\|/pr.ts\|providers.ts\|/run.ts\|/serve.ts\|/session.ts\|stats.ts\|worker.ts\|/web.ts\|upgrade.ts\|worktree.ts"
```

- [ ] **Step 2: Apply same fix pattern from Task 6 to all files**

For each handler error:
- `function* ()` with no args → `function* (_args)`
- `function* (args)` typed as `any` → add explicit type from builder's positionals

Check each file's builder to know the correct arg shape:
```bash
grep -A 10 "builder:" src/cli/cmd/debug/agent.ts
```

- [ ] **Step 3: Handle the github.ts agent.ts duplicate type error specifically**

The error in `src/cli/cmd/agent.ts(64,3)` is `TS2719: Two different types with this name exist, but they are unrelated`. This is an Effect duplicate Service type issue. Fix by explicitly casting the return type:
```typescript
handler: Effect.fn("Cli.agent.xxx")(function* (args: WithDoubleDash<{ ... }>) {
  // ... handler body ...
}) as (args: WithDoubleDash<{ ... }>) => Effect.Effect<void, CliError, AppServices | InstanceStore.Service>
```

- [ ] **Step 4: Run typecheck on all debug/ and remaining CLI files**

```bash
bun run typecheck 2>&1 | grep "debug/\|github.ts\|/mcp.ts\|/pr.ts\|providers.ts\|/run.ts\|/serve.ts\|/session.ts\|stats.ts\|worker.ts\|/web.ts\|upgrade.ts\|worktree.ts"
```
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/cli/cmd/debug/ src/cli/cmd/github.ts src/cli/cmd/mcp.ts \
        src/cli/cmd/pr.ts src/cli/cmd/providers.ts src/cli/cmd/run.ts \
        src/cli/cmd/serve.ts src/cli/cmd/session.ts src/cli/cmd/stats.ts \
        src/cli/cmd/tui/worker.ts src/cli/cmd/web.ts src/cli/upgrade.ts \
        src/control-plane/adapters/worktree.ts
git commit -m "fix: type CLI command handler args across debug/, github, mcp, pr, and remaining commands"
```

---

### Task 8: Fix effect-cmd.ts and plugin/index.ts handler types

**Files:**
- Modify: `src/cli/effect-cmd.ts`
- Modify: `src/plugin/index.ts`

- [ ] **Step 1: Check specific errors**

```bash
bun run typecheck 2>&1 | grep "effect-cmd.ts\|plugin/index.ts"
```

- [ ] **Step 2: Fix effect-cmd.ts if needed**

The effectCmd signature in `src/cli/effect-cmd.ts:50` allows `(args: WithDoubleDash<Args>) => Effect.Effect<A, CliError, AppServices | InstanceStore.Service>`. If TypeScript is complaining about the internal cast at line 75 (`builder: opts.builder as never`), check if a looser cast is needed.

- [ ] **Step 3: Fix plugin/index.ts any types in hook dispatch**

The plugin hook types at lines 238-269 use `as any` to call hooks dynamically. Replace the `any` casts with a typed discriminated approach:

```typescript
// Instead of: const fn = hook[name] as any
// Use a type-safe helper:
function callHook<K extends keyof Hooks>(
  hook: Hooks, 
  name: K, 
  ...args: Parameters<NonNullable<Hooks[K]>>
): ReturnType<NonNullable<Hooks[K]>> | void {
  const fn = hook[name]
  if (fn) return (fn as Function)(...args) as any
}
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "effect-cmd.ts\|plugin/index.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/effect-cmd.ts src/plugin/index.ts
git commit -m "fix: improve types in effect-cmd and plugin hook dispatch"
```

---

## Phase 3: Fix Test Layer Composition Errors (~46 errors across 22 test files)

The test fixture layers don't include `MemoryLayer` and possibly other new services. After Phase 1 adds MemoryLayer to AppLayer, many test errors may clear automatically. This phase fixes the remaining ones.

### Task 9: Fix test fixture layers — add missing services

**Files:**
- Modify: `test/fixture/fixture.ts` (or wherever TestInstance/TestConfig layers are defined)
- Modify: `test/tool/registry.test.ts`
- Modify: `test/tool/session_search.test.ts`
- Modify: `test/tool/skill.test.ts`
- Modify: `test/tool/task.test.ts`
- Modify: `test/session/prompt.test.ts`
- Modify: `test/session/snapshot-tool-race.test.ts`
- Modify: `test/session/structured-output-integration.test.ts`

- [ ] **Step 1: Run typecheck after Phase 1 & 2 to see remaining test errors**

```bash
bun run typecheck 2>&1 | grep "test/" | grep "error TS" | wc -l
```

- [ ] **Step 2: Identify what services are still missing in test layers**

```bash
bun run typecheck 2>&1 | grep "test/" | grep "error TS" | head -20
```

For each `Service | Service is not assignable to never` error, identify the test file and what service it's requiring.

- [ ] **Step 3: Add MemoryLayer to test fixture that builds ToolRegistry**

In `test/tool/registry.test.ts`, the `registryLayer` function at line 42 already provides many services. Add MemoryLayer:

```typescript
import { MemoryLayer } from "@/memory/index"

const registryLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  ToolRegistry.layer
    .pipe(
      Layer.provide(configLayer),
      // ... existing layers ...
      Layer.provide(MemoryLayer),  // ADD THIS
      Layer.provide(RuntimeFlags.layer(flags)),
    )
```

Apply the same MemoryLayer addition to other test files that build ToolRegistry.

- [ ] **Step 4: Fix remaining test file Layer compositions**

For each remaining test error, check what service is required and add it to the test layer. Common pattern:
```typescript
// In testEffect() call:
const it = testEffect(Layer.mergeAll(
  registryLayer(), 
  node, 
  Agent.defaultLayer,
  MemoryLayer,    // add missing service
))
```

- [ ] **Step 5: Fix the server/httpapi test errors**

```bash
bun run typecheck 2>&1 | grep "test/server/"
```

Server tests likely need the full AppLayer or a comprehensive test layer. Check if there's a shared `TestAppLayer` and add the missing services to it.

- [ ] **Step 6: Run all tests to verify nothing is broken**

```bash
bun test 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
git add test/
git commit -m "fix: add MemoryLayer and missing services to test fixture layers"
```

---

### Task 10: Fix remaining memory/control-plane/provider test errors

**Files:**
- Modify: `test/memory/curator.test.ts`
- Modify: `test/control-plane/workspace.test.ts`
- Modify: `test/plugin/workspace-adapter.test.ts`
- Modify: `test/provider/amazon-bedrock.test.ts`
- Modify: `test/provider/provider.test.ts`
- Modify: `test/effect/app-runtime-logger.test.ts`
- Modify: `test/server/httpapi-event.test.ts` and other httpapi tests

- [ ] **Step 1: Check errors in each file**

```bash
bun run typecheck 2>&1 | grep "test/memory\|test/control\|test/plugin\|test/provider\|test/effect\|test/server"
```

- [ ] **Step 2: For curator.test.ts — add VectorService and GraphService to test layer**

```bash
grep -n "Layer\|testEffect\|layer" test/memory/curator.test.ts | head -20
```

Add the required services to the test layer in curator.test.ts. VectorService and GraphService likely have test/mock implementations or `defaultLayer`s:
```typescript
import { VectorService } from "@/memory/vector/vector"
import { GraphService } from "@/memory/graph/graph"

const testLayer = Layer.mergeAll(
  CuratorService.layer,
  VectorService.defaultLayer,
  GraphService.defaultLayer,
)
```

- [ ] **Step 3: Fix provider test errors**

```bash
grep -n "Layer\|error" test/provider/provider.test.ts | head -20
```

- [ ] **Step 4: Final typecheck — target zero errors**

```bash
bun run typecheck 2>&1 | grep "error TS" | wc -l
```
Expected: 0

- [ ] **Step 5: Run full test suite**

```bash
bun test 2>&1 | grep -E "pass|fail|error" | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add test/memory/ test/control-plane/ test/plugin/ test/provider/ test/effect/ test/server/
git commit -m "fix: resolve remaining test layer composition errors"
```

---

## Phase 4: Type Safety Improvements

### Task 11: Fix catch (e: any) patterns

**Files:**
- Modify: `src/cli/cmd/github.ts:686`
- Modify: `src/mcp/index.ts:201` and `src/mcp/index.ts:729`

- [ ] **Step 1: Find all catch (e: any) occurrences**

```bash
grep -rn "catch (e: any\|catch(e: any" src/ --include="*.ts"
```

- [ ] **Step 2: Fix github.ts:686**

```typescript
// Before:
} catch (e: any) {
  exitCode = 1
  console.error(e instanceof Error ? e.message : String(e))
  let msg = e

// After:
} catch (e: unknown) {
  exitCode = 1
  const err = e instanceof Error ? e : new Error(String(e))
  console.error(err.message)
  let msg: string = err.message
```

Adjust the rest of the catch block to use `msg` as `string` consistently.

- [ ] **Step 3: Fix mcp/index.ts occurrences**

```typescript
// Before:
catch: (e: any) => {

// After:
catch: (e: unknown) => {
```

Then inside the catch body, use `e instanceof Error ? e.message : String(e)` instead of `e.message` directly.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "github.ts\|mcp/index.ts"
```
Expected: no new errors from these files

- [ ] **Step 5: Commit**

```bash
git add src/cli/cmd/github.ts src/mcp/index.ts
git commit -m "fix: replace catch(e: any) with catch(e: unknown) for type safety"
```

---

### Task 12: Reduce any in provider.ts

**Files:**
- Modify: `src/provider/provider.ts:91-141`

- [ ] **Step 1: Read the BUNDLED_PROVIDERS and related types**

```bash
sed -n '85,160p' src/provider/provider.ts
```

- [ ] **Step 2: Define a proper SDK type instead of any**

```typescript
// Before:
const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {

// After — create a minimal typed interface:
interface ProviderSDKFactory {
  (opts: Record<string, unknown>): BundledSDK
}
const BUNDLED_PROVIDERS: Record<string, () => Promise<ProviderSDKFactory>> = {
```

- [ ] **Step 3: Fix CustomModelLoader and useLanguageModel**

```typescript
// Before:
type CustomModelLoader = (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
function useLanguageModel(sdk: any) {
function selectAzureLanguageModel(sdk: any, modelID: string, useChat: boolean) {

// After:
type ProviderSDK = Record<string, unknown>  // narrowest safe shape
type CustomModelLoader = (sdk: ProviderSDK, modelID: string, options?: Record<string, unknown>) => Promise<LanguageModel>
function useLanguageModel(sdk: ProviderSDK) {
function selectAzureLanguageModel(sdk: ProviderSDK, modelID: string, useChat: boolean) {
```

Import `LanguageModel` from the AI SDK if not already imported.

- [ ] **Step 4: Run typecheck and fix any cascading issues**

```bash
bun run typecheck 2>&1 | grep "provider.ts"
```

- [ ] **Step 5: Commit**

```bash
git add src/provider/provider.ts
git commit -m "fix: replace any with typed interfaces in provider SDK loading"
```

---

### Task 13: Reduce any in copilot.ts

**Files:**
- Modify: `src/plugin/github-copilot/copilot.ts:32-140`

- [ ] **Step 1: Read the any-using functions**

```bash
sed -n '28,145p' src/plugin/github-copilot/copilot.ts
```

- [ ] **Step 2: Define message/part types**

The functions `imgMsg`, and the various content-checking lambdas use `any` for message objects. Define minimal structural types:

```typescript
interface MessagePart {
  type: string
  content?: MessagePart[] | string
}

interface Message {
  role?: string
  content?: MessagePart[] | string
}

function imgMsg(msg: Message): boolean {
  // ...
}
```

Replace the `(msg: any)`, `(part: any)`, `(item: any)` patterns with the typed interfaces.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck 2>&1 | grep "copilot.ts"
```

- [ ] **Step 4: Commit**

```bash
git add src/plugin/github-copilot/copilot.ts
git commit -m "fix: replace any with Message/Part types in copilot plugin"
```

---

## Phase 5: Structural Improvements (Separate Long-Running Effort)

These items are architectural and carry more risk. Each warrants its own plan.

### 5A: Tool Registry Lazy Loading (½ day)

**Goal:** Replace 60+ synchronous top-level imports in `src/tool/registry.ts` with dynamic `import()` calls, gated by feature flags or tool capability checks.

**Approach:**
1. Convert each `import { XTool } from "./x"` to a dynamic import inside the registry build function
2. Use a `Map<string, () => Promise<Tool>>` pattern
3. Add a `toolName` → `importPath` registry constant at the top of the file

**Note:** This reduces startup memory but adds complexity. Only valuable if profiling shows registry import cost matters.

### 5B: session/prompt.ts Decomposition (1-2 days)

**Goal:** Split `src/session/prompt.ts` (2,277 lines) into focused modules.

**Suggested split:**
- `src/session/prompt/builder.ts` — PromptBuilder class and message assembly
- `src/session/prompt/context.ts` — context window management, truncation
- `src/session/prompt/system.ts` — system prompt construction
- `src/session/prompt/tools.ts` — tool call formatting
- `src/session/prompt/index.ts` — re-exports (keep backward compat)

**Risk:** High — many imports and tests depend on current structure. Needs dedicated planning session.

### 5C: lsp/server.ts Decomposition (1 day)

**Goal:** Split `src/lsp/server.ts` (2,064 lines) into capability-focused modules.

**Suggested split:**
- `src/lsp/server/installer.ts` — LSP binary download and installation logic
- `src/lsp/server/lifecycle.ts` — process start/stop/health check
- `src/lsp/server/diagnostics.ts` — error/warning reporting
- `src/lsp/server/index.ts` — re-exports

### 5D: Effect Test Migration (1+ week)

**Goal:** Migrate all tests from legacy `ManagedRuntime` + `Bun.sleep` patterns to proper Effect test utilities per `test/EFFECT_TEST_MIGRATION.md`.

**Prerequisite:** Phases 1-3 complete (zero type errors).

---

## Verification

After completing Phases 1-4:

```bash
# Zero type errors
bun run typecheck 2>&1 | grep "error TS" | wc -l
# Expected: 0

# All tests pass
bun test 2>&1 | tail -10
# Expected: no failures

# Zero catch(e: any) remaining
grep -rn "catch (e: any\|catch(e: any" src/ --include="*.ts"
# Expected: no output

# Check any count reduced
grep -rn ": any\|as any\|any\[\]\|<any>" src/ --include="*.ts" | wc -l
# Expected: significantly fewer than 73
```
