import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { Service as GraphService } from "./graph"
import DESCRIPTION from "./memory_graph.txt"

const Parameters = Schema.Struct({
  question: Schema.String.annotate({
    description: "Natural language question about past work, files, decisions, or concepts.",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of graph nodes to return. Default: 10.",
  }),
})

export const MemoryGraphTool = Tool.define(
  "memory_graph",
  Effect.gen(function* () {
    const graph = yield* GraphService
    const run = Effect.fn("MemoryGraphTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      _ctx: Tool.Context,
    ) {
      const results = yield* graph.query({ question: params.question, limit: params.limit ?? 10 })
      return {
        title: "Memory graph query",
        metadata: { mode: "query" as const, count: results.length, question: params.question },
        output: JSON.stringify({ success: true, question: params.question, results }, null, 2),
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
