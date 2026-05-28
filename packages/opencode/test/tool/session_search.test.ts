import { CrossSpawnSpawner } from "@openloom/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import type { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { SessionSearchTool } from "@/tool/session_search"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ProviderID, ModelID } from "@/provider/schema"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const baseCtx: Omit<Tool.Context, "sessionID" | "messageID" | "ask"> = {
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, Session.defaultLayer, CrossSpawnSpawner.defaultLayer))

afterEach(async () => {
  await disposeAllInstances()
})

describe("tool.session_search", () => {
  it.live("browses, searches, and scrolls prior session messages", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const past = yield* sessions.create({ title: "Hermes memory spike", agent: "build" })
          const current = yield* sessions.create({ title: "Current work", agent: "build" })
          const first = MessageID.ascending()
          const second = MessageID.ascending()
          const third = MessageID.ascending()

          yield* sessions.updateMessage({
            id: first,
            sessionID: past.id,
            role: "user",
            time: { created: Date.now() - 3_000 },
            agent: "build",
            model: {
              providerID: ProviderID.make("openloom"),
              modelID: ModelID.make("gpt-5"),
            },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID: past.id,
            messageID: first,
            type: "text",
            text: "We decided the Hermes recall feature should start with local session search.",
          })
          yield* sessions.updateMessage({
            id: second,
            sessionID: past.id,
            role: "assistant",
            time: { created: Date.now() - 2_000, completed: Date.now() - 1_500 },
            parentID: first,
            modelID: ModelID.make("gpt-5"),
            providerID: ProviderID.make("openloom"),
            mode: "build",
            agent: "build",
            path: { cwd: "C:\\test", root: "C:\\test" },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            finish: "stop",
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID: past.id,
            messageID: second,
            type: "text",
            text: "The first implementation should expose browse, search, and scroll modes.",
          })
          yield* sessions.updateMessage({
            id: third,
            sessionID: past.id,
            role: "user",
            time: { created: Date.now() - 1_000 },
            agent: "build",
            model: {
              providerID: ProviderID.make("openloom"),
              modelID: ModelID.make("gpt-5"),
            },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID: past.id,
            messageID: third,
            type: "text",
            text: "Later we can replace LIKE matching with an FTS index.",
          })

          const registry = yield* ToolRegistry.Service
          const tool = (yield* registry.all()).find((item) => item.id === SessionSearchTool.id)
          if (!tool) throw new Error("session_search tool not found")

          const ctx: Tool.Context = {
            ...baseCtx,
            sessionID: current.id,
            messageID: MessageID.make("msg_test"),
            ask: () => Effect.void,
          }

          const browse = JSON.parse((yield* tool.execute({}, ctx)).output)
          expect(browse.mode).toBe("browse")
          expect(browse.results.some((item: { session_id: string }) => item.session_id === past.id)).toBe(true)
          expect(browse.results.some((item: { session_id: string }) => item.session_id === current.id)).toBe(false)

          const search = JSON.parse((yield* tool.execute({ query: "Hermes recall" }, ctx)).output)
          expect(search.mode).toBe("search")
          expect(search.results[0].session_id).toBe(past.id)
          expect(search.results[0].messages.some((item: { text: string }) => item.text.includes("Hermes recall"))).toBe(
            true,
          )

          const scroll = JSON.parse(
            (yield* tool.execute({ session_id: past.id, around_message_id: second, window: 1 }, ctx)).output,
          )
          expect(scroll.mode).toBe("scroll")
          expect(scroll.messages.map((item: { id: string }) => item.id)).toEqual([first, second, third])
        }),
      { git: true },
    ),
    15_000,
  )
})
