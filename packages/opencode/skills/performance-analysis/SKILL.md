---
name: performance-analysis
description: >
  Performance profiling and optimization: identify bottlenecks, measure before optimizing, validate improvements.
  Use when: investigating slow responses, high memory usage, CPU spikes, or latency regressions.
  Skip when: premature optimization — only optimize what you've measured.
---

# Performance Analysis

**Rule:** Measure first. Optimize second. Measure again.

Never optimize based on intuition. The bottleneck is almost never where you think it is.

## Step 1 — Establish the Baseline

Before touching any code, measure the current behavior:

```bash
# Node.js — CPU profile
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Memory snapshot
node --inspect app.js
# Open chrome://inspect → Memory → Take heap snapshot

# HTTP benchmark
wrk -t4 -c100 -d30s http://localhost:3000/api/sessions
# or
autocannon -c 100 -d 30 http://localhost:3000/api/sessions
```

Record: requests/sec, p50/p95/p99 latency, memory RSS.

## Step 2 — Find the Bottleneck

Profile — don't guess:

```typescript
// Quick timing in code
console.time("database-query")
const result = await db.select()...
console.timeEnd("database-query")

// More precise
const start = performance.now()
await expensiveOperation()
console.log(`took ${(performance.now() - start).toFixed(2)}ms`)
```

Common bottleneck categories:
- **I/O bound** — database queries, file reads, network calls
- **CPU bound** — parsing, serialization, crypto, regex on large strings
- **Memory bound** — large in-memory datasets, GC pressure, leaks

## Step 3 — Fix the Right Layer

### Database Slow Queries
```sql
-- SQLite: explain query plan
EXPLAIN QUERY PLAN SELECT * FROM session WHERE project_id = ?;
-- "SCAN TABLE" = missing index
-- "SEARCH TABLE USING INDEX" = good
```

### N+1 Queries
Batch with `WHERE id IN (...)` instead of one query per item.

### Memory Leaks
Common causes: event listeners never removed, cache that grows unboundedly, circular references.

### CPU: Cache Repeated Work
```typescript
// Expensive computation called repeatedly with same args → memoize
const cache = new Map<string, Result>()
function getResult(key: string): Result {
  if (cache.has(key)) return cache.get(key)!
  const result = expensiveCompute(key)
  cache.set(key, result)
  return result
}
```

## Step 4 — Validate the Improvement

Run the same benchmark from Step 1. The improvement must be measurable. If it's within noise, the optimization didn't work — revert it.

Document the result:
```
Before: p99 = 450ms, 1,200 req/s
After:  p99 = 85ms,  4,800 req/s
Change: Added index on session.project_id
```
