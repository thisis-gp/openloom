import { Effect, Schema } from "effect"
import * as Option from "effect/Option"
import { NonNegativeInt } from "@openloom/core/schema"
import * as Tool from "./tool"
import DESCRIPTION from "./session_search.txt"
import { InstanceState } from "@/effect/instance-state"
import { Database, and, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from "@/storage/db"
import { MessageTable, PartTable, SessionTable } from "@/session/session.sql"
import { MessageID, SessionID } from "@/session/schema"
import type { MessageV2 } from "@/session/message-v2"
import { VectorService } from "@/memory/vector/vector"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Provider } from "@/provider/provider"

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const DEFAULT_WINDOW = 5
const MAX_WINDOW = 20
const MAX_TEXT = 1_200

const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({
    description: "Search query. When provided, session_search returns matching past messages.",
  }),
  semantic: Schema.optional(Schema.Boolean).annotate({
    description: "Use semantic (vector) search instead of keyword matching. Requires query. Default: false.",
  }),
  session_id: Schema.optional(SessionID).annotate({
    description: "Session id to scroll. Must be paired with around_message_id.",
  }),
  around_message_id: Schema.optional(MessageID).annotate({
    description: "Message id to center the scroll window around. Must be paired with session_id.",
  }),
  window: Schema.optional(NonNegativeInt).annotate({
    description: "Number of messages before and after around_message_id to return. Defaults to 5, max 20.",
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "Maximum number of sessions or matches to return. Defaults to 5, max 20.",
  }),
})

type MessageRow = typeof MessageTable.$inferSelect
type SessionRow = typeof SessionTable.$inferSelect
type PartRow = typeof PartTable.$inferSelect
type WithParts = {
  info: MessageV2.Info
  parts: MessageV2.Part[]
}

function clamp(value: number | undefined, fallback: number, max: number) {
  if (!value) return fallback
  return Math.max(1, Math.min(value, max))
}

function text(value: string | undefined) {
  if (!value) return ""
  if (value.length <= MAX_TEXT) return value
  return value.slice(0, MAX_TEXT) + `\n[truncated ${value.length - MAX_TEXT} chars]`
}

function partText(part: MessageV2.Part) {
  if (part.type === "text") return part.text
  if (part.type === "reasoning") return part.text
  if (part.type === "subtask") return `${part.description}\n${part.prompt}`
  if (part.type === "file") return [part.filename, part.url].filter(Boolean).join("\n")
  if (part.type === "tool") {
    if (part.state.status === "completed") return [part.tool, part.state.title, part.state.output].join("\n")
    if (part.state.status === "error") return [part.tool, part.state.error].join("\n")
    if (part.state.status === "pending") return [part.tool, part.state.raw].filter(Boolean).join("\n")
    return part.tool
  }
  return ""
}

function messageText(message: WithParts) {
  return text(message.parts.map(partText).filter(Boolean).join("\n\n"))
}

function shapeMessage(message: WithParts, anchor?: MessageID) {
  return {
    id: message.info.id,
    role: message.info.role,
    created_at: message.info.time.created,
    anchor: message.info.id === anchor || undefined,
    text: messageText(message),
  }
}

function likePattern(term: string) {
  return `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
}

function queryTerms(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 8)
}

function partMatches(terms: string[]) {
  return terms.map((term) => sql`${PartTable.data} LIKE ${likePattern(term)} ESCAPE '\\'`) as SQL[]
}

function messageInfo(row: MessageRow) {
  return {
    ...row.data,
    id: row.id,
    sessionID: row.session_id,
  } as MessageV2.Info
}

function partInfo(row: PartRow) {
  return {
    ...row.data,
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
  } as MessageV2.Part
}

function hydrate(rows: MessageRow[]) {
  const ids = rows.map((row) => row.id)
  const byMessage = new Map<string, MessageV2.Part[]>()
  if (ids.length > 0) {
    const partRows = Database.use((db) =>
      db.select().from(PartTable).where(inArray(PartTable.message_id, ids)).orderBy(PartTable.message_id, PartTable.id).all(),
    )
    for (const row of partRows) {
      const list = byMessage.get(row.message_id)
      if (list) list.push(partInfo(row))
      else byMessage.set(row.message_id, [partInfo(row)])
    }
  }
  return rows.map((row) => ({ info: messageInfo(row), parts: byMessage.get(row.id) ?? [] }))
}

function olderThan(row: MessageRow) {
  return or(
    lt(MessageTable.time_created, row.time_created),
    and(eq(MessageTable.time_created, row.time_created), lt(MessageTable.id, row.id)),
  )
}

function newerThan(row: MessageRow) {
  return or(
    gt(MessageTable.time_created, row.time_created),
    and(eq(MessageTable.time_created, row.time_created), gt(MessageTable.id, row.id)),
  )
}

function getSession(id: SessionID) {
  return Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
}

function rootSessionID(id: SessionID) {
  const seen = new Set<string>()
  let current: SessionID | undefined = id
  while (current && !seen.has(current)) {
    seen.add(current)
    const row = getSession(current)
    if (!row?.parent_id) return current
    current = row.parent_id
  }
  return id
}

function windowAround(sessionID: SessionID, messageID: MessageID, window: number) {
  const center = Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), eq(MessageTable.id, messageID)))
      .get(),
  )
  if (!center) return undefined

  const before = Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), olderThan(center)))
      .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
      .limit(window)
      .all(),
  ).reverse()
  const after = Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.session_id, sessionID), newerThan(center)))
      .orderBy(MessageTable.time_created, MessageTable.id)
      .limit(window)
      .all(),
  )

  return hydrate([...before, center, ...after])
}

function bookends(sessionID: SessionID) {
  const start = hydrate(
    Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionID))
        .orderBy(MessageTable.time_created, MessageTable.id)
        .limit(3)
        .all(),
    ),
  )
  const end = hydrate(
    Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionID))
        .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
        .limit(3)
        .all(),
    ),
  ).reverse()
  return {
    start: start.map((message) => shapeMessage(message)),
    end: end.map((message) => shapeMessage(message)),
  }
}

export const SessionSearchTool = Tool.define(
  "session_search",
  Effect.gen(function* () {
    const vectorOpt = yield* Effect.serviceOption(VectorService.Service)
    const configOpt = yield* Effect.serviceOption(Config.Service)
    const authOpt = yield* Effect.serviceOption(Auth.Service)
    const providerOpt = yield* Effect.serviceOption(Provider.Service)

    const run = Effect.fn("SessionSearchTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const instance = yield* InstanceState.context
      const limit = clamp(params.limit, DEFAULT_LIMIT, MAX_LIMIT)
      const window = clamp(params.window, DEFAULT_WINDOW, MAX_WINDOW)
      const currentRoot = rootSessionID(ctx.sessionID)

      if (params.query?.trim()) {
        const terms = queryTerms(params.query)
        if (terms.length === 0) return yield* Effect.fail(new Error("query must include at least one searchable term"))

        if (params.semantic) {
          if (Option.isSome(vectorOpt)) {
            const searchEffect = vectorOpt.value.search({ query: params.query, limit: limit * 3 })
            const withDeps =
              Option.isSome(configOpt) && Option.isSome(authOpt) && Option.isSome(providerOpt)
                ? searchEffect.pipe(
                    Effect.provideService(Config.Service, configOpt.value),
                    Effect.provideService(Auth.Service, authOpt.value),
                    Effect.provideService(Provider.Service, providerOpt.value),
                  )
                : Effect.succeed([] as Array<{ archiveID: string; sessionID: SessionID; score: number }>)
            const matches = yield* withDeps
            if (matches.length > 0) {
              const seen = new Set<string>()
              const results = []
              for (const match of matches) {
                const root = rootSessionID(match.sessionID)
                if (root === currentRoot) continue
                if (seen.has(root)) continue
                seen.add(root)
                const session = getSession(root)
                if (!session) continue
                const edges = bookends(root)
                results.push({
                  session_id: root,
                  title: session.title,
                  path: session.path,
                  agent: session.agent,
                  created_at: session.time_created,
                  updated_at: session.time_updated,
                  similarity_score: match.score,
                  bookend_start: edges.start,
                  bookend_end: edges.end,
                })
                if (results.length >= limit) break
              }
              if (results.length > 0) {
                return {
                  title: "Semantic session search",
                  metadata: {
                    mode: "semantic",
                    query: params.query,
                    count: results.length,
                    session_id: "",
                    around_message_id: "",
                  },
                  output: JSON.stringify(
                    { success: true, mode: "semantic", query: params.query, results },
                    null,
                    2,
                  ),
                }
              }
            }
          }
        }

        const rows = Database.use((db) =>
          db
            .select({
              session: SessionTable,
              message: MessageTable,
            })
            .from(PartTable)
            .innerJoin(MessageTable, eq(PartTable.message_id, MessageTable.id))
            .innerJoin(SessionTable, eq(MessageTable.session_id, SessionTable.id))
            .where(
              and(
                eq(SessionTable.project_id, instance.project.id),
                isNull(SessionTable.time_archived),
                ...partMatches(terms),
              ),
            )
            .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
            .limit(limit * 12)
            .all(),
        )

        const seen = new Set<string>()
        const results = []
        for (const row of rows) {
          const root = rootSessionID(row.session.id)
          if (root === currentRoot) continue
          if (seen.has(root)) continue
          seen.add(root)
          const session = getSession(root) ?? row.session
          const around = windowAround(row.session.id, row.message.id, window) ?? []
          const edges = bookends(root)
          results.push({
            session_id: root,
            matched_session_id: row.session.id === root ? undefined : row.session.id,
            title: session.title,
            path: session.path,
            agent: session.agent,
            created_at: session.time_created,
            updated_at: session.time_updated,
            anchor_message_id: row.message.id,
            snippet: messageText(hydrate([row.message])[0] ?? { info: messageInfo(row.message), parts: [] }),
            messages: around.map((message) => shapeMessage(message, row.message.id)),
            bookend_start: edges.start,
            bookend_end: edges.end,
          })
          if (results.length >= limit) break
        }

        return {
          title: "Session search",
          metadata: {
            mode: "search",
            query: params.query,
            count: results.length,
            session_id: "",
            around_message_id: "",
          },
          output: JSON.stringify({ success: true, mode: "search", query: params.query, results }, null, 2),
        }
      }

      if (params.session_id || params.around_message_id) {
        if (!params.session_id || !params.around_message_id) {
          return yield* Effect.fail(new Error("scroll mode requires both session_id and around_message_id"))
        }
        const session = getSession(params.session_id)
        if (!session || session.project_id !== instance.project.id) {
          return yield* Effect.fail(new Error(`session not found in current project: ${params.session_id}`))
        }
        const messages = windowAround(params.session_id, params.around_message_id, window)
        if (!messages) {
          return yield* Effect.fail(new Error(`message not found in session: ${params.around_message_id}`))
        }
        return {
          title: "Session scroll",
          metadata: {
            mode: "scroll",
            query: "",
            count: messages.length,
            session_id: params.session_id,
            around_message_id: params.around_message_id,
          },
          output: JSON.stringify(
            {
              success: true,
              mode: "scroll",
              session_id: params.session_id,
              around_message_id: params.around_message_id,
              messages: messages.map((message) => shapeMessage(message, params.around_message_id)),
            },
            null,
            2,
          ),
        }
      }

      const sessions = Database.use((db) =>
        db
          .select()
          .from(SessionTable)
          .where(and(eq(SessionTable.project_id, instance.project.id), isNull(SessionTable.parent_id), isNull(SessionTable.time_archived)))
          .orderBy(desc(SessionTable.time_updated), desc(SessionTable.id))
          .limit(limit + 5)
          .all(),
      )
        .filter((session) => rootSessionID(session.id) !== currentRoot)
        .slice(0, limit)

      const results = sessions.map((session) => {
        const latest = hydrate(
          Database.use((db) =>
            db
              .select()
              .from(MessageTable)
              .where(eq(MessageTable.session_id, session.id))
              .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
              .limit(1)
              .all(),
          ),
        )[0]
        return {
          session_id: session.id,
          title: session.title,
          path: session.path,
          agent: session.agent,
          created_at: session.time_created,
          updated_at: session.time_updated,
          preview: latest ? messageText(latest) : "",
        }
      })

      return {
        title: "Recent sessions",
        metadata: {
          mode: "browse",
          query: "",
          count: results.length,
          session_id: "",
          around_message_id: "",
        },
        output: JSON.stringify({ success: true, mode: "browse", results }, null, 2),
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
