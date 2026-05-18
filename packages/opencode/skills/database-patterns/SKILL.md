---
name: database-patterns
description: >
  SQL and SQLite best practices: schema design, indexes, migrations, query patterns, and Drizzle ORM usage.
  Use when: adding a new table, writing complex queries, designing a schema, adding migrations, optimizing slow queries.
---

# Database Patterns

## Schema Design Principles

- Every table has a single-column primary key (prefer UUID or auto-increment integer)
- Foreign keys with `ON DELETE CASCADE` for child rows that shouldn't exist without the parent
- `NOT NULL` by default — make nullable explicit and justified
- Store timestamps as Unix milliseconds (integer) not ISO strings (sortable, no timezone issues)
- Prefer narrow tables — wide tables with many nullable columns usually need normalization

```typescript
// Openloom Drizzle pattern
export const ThingTable = sqliteTable(
  "thing",
  {
    id: text().$type<ThingID>().primaryKey(),
    name: text().notNull(),
    owner_id: text()
      .$type<UserID>()
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    meta: text({ mode: "json" }).$type<ThingMeta>(),
    ...Timestamps,   // time_created, time_updated
  },
  (t) => [index("thing_owner_idx").on(t.owner_id)],
)
```

## Indexing

- Index every column used in `WHERE` clauses in high-traffic queries
- Index every FK column (SQLite doesn't auto-index FKs)
- Compound index: column order = selectivity desc (most selective first)
- Don't index small tables (<1000 rows) — full scan is faster

## Migrations

- One migration = one logical change
- Migrations are append-only — never edit a deployed migration
- For SQLite ALTER TABLE limitations, use the copy-rename pattern:
  1. Create new table with desired schema
  2. Copy data: `INSERT INTO new SELECT ... FROM old`
  3. Drop old: `DROP TABLE old`
  4. Rename: `ALTER TABLE new RENAME TO old`

## Query Patterns

```typescript
// SELECT with join — use Drizzle's query builder
const sessions = await db
  .select({ id: SessionTable.id, title: SessionTable.title })
  .from(SessionTable)
  .where(eq(SessionTable.project_id, projectId))
  .orderBy(desc(SessionTable.time_created))
  .limit(50)

// Upsert (insert or update)
await db
  .insert(MemoryTable)
  .values(row)
  .onConflictDoUpdate({ target: MemoryTable.session_id, set: { title: row.title } })

// Soft delete (keep the row, just mark it)
await db
  .update(SessionTable)
  .set({ time_archived: Date.now() })
  .where(eq(SessionTable.id, sessionId))
```

## N+1 Prevention

```typescript
// BAD: N+1 — one query per session
const sessions = await db.select().from(SessionTable)
for (const session of sessions) {
  const messages = await db.select().from(MessageTable)
    .where(eq(MessageTable.session_id, session.id))  // N queries
}

// GOOD: one query with join or IN clause
const messages = await db.select().from(MessageTable)
  .where(inArray(MessageTable.session_id, sessions.map(s => s.id)))
```

## SQLite-Specific Settings

Always enable these pragmas at connection time:
```sql
PRAGMA journal_mode = WAL;        -- concurrent reads + writes
PRAGMA synchronous = NORMAL;      -- safe + faster than FULL
PRAGMA foreign_keys = ON;         -- enforce FK constraints
PRAGMA busy_timeout = 5000;       -- wait instead of SQLITE_BUSY
```
