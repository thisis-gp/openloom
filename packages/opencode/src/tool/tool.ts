import { Effect, Schema } from "effect"
import * as Option from "effect/Option"
import type { JSONSchema7 } from "@ai-sdk/provider"
import type { MessageV2 } from "../session/message-v2"
import type { Permission } from "../permission"
import type { SessionID, MessageID } from "../session/schema"
import * as Truncate from "./truncate"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { scan as aidefenceScan } from "@/security/aidefence"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool" })

interface Metadata {
  [key: string]: unknown
}

// TODO: remove this hack
export type DynamicDescription = (agent: Agent.Info) => Effect.Effect<string>

export type Context<M extends Metadata = Metadata> = {
  sessionID: SessionID
  messageID: MessageID
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: unknown }
  messages: MessageV2.WithParts[]
  metadata(input: { title?: string; metadata?: M }): Effect.Effect<void>
  ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
}

export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
  attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
}

export interface Def<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> {
  id: string
  description: string
  parameters: Parameters
  jsonSchema?: JSONSchema7
  execute(args: Schema.Schema.Type<Parameters>, ctx: Context): Effect.Effect<ExecuteResult<M>>
  formatValidationError?(error: unknown): string
}
export type DefWithoutID<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> = Omit<Def<Parameters, M>, "id">

export interface Info<
  Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>,
  M extends Metadata = Metadata,
> {
  id: string
  init: () => Effect.Effect<DefWithoutID<Parameters, M>>
}

type Init<Parameters extends Schema.Decoder<unknown>, M extends Metadata> =
  | DefWithoutID<Parameters, M>
  | (() => Effect.Effect<DefWithoutID<Parameters, M>>)

export type InferParameters<T> =
  T extends Info<infer P, infer _Metadata>
    ? Schema.Schema.Type<P>
    : T extends Effect.Effect<Info<infer P, infer _Metadata>, infer _Error, infer _Requirements>
      ? Schema.Schema.Type<P>
      : never
export type InferMetadata<T> =
  T extends Info<Schema.Decoder<unknown>, infer M>
    ? M
    : T extends Effect.Effect<Info<Schema.Decoder<unknown>, infer M>, infer _Error, infer _Requirements>
      ? M
      : never

export type InferDef<T> =
  T extends Info<infer P, infer M>
    ? Def<P, M>
    : T extends Effect.Effect<Info<infer P, infer M>, infer _Error, infer _Requirements>
      ? Def<P, M>
      : never

function wrap<Parameters extends Schema.Decoder<unknown>, Result extends Metadata>(
  id: string,
  init: Init<Parameters, Result>,
  truncate: Truncate.Interface,
  agents: Agent.Interface,
) {
  return () =>
    Effect.gen(function* () {
      const toolInfo = typeof init === "function" ? { ...(yield* init()) } : { ...init }
      // Compile the parser closure once per tool init; `decodeUnknownEffect`
      // allocates a new closure per call, so hoisting avoids re-closing it for
      // every LLM tool invocation.
      const decode = Schema.decodeUnknownEffect(toolInfo.parameters)
      const execute = toolInfo.execute
      toolInfo.execute = (args, ctx) => {
        const attrs = {
          "tool.name": id,
          "session.id": ctx.sessionID,
          "message.id": ctx.messageID,
          ...(ctx.callID ? { "tool.call_id": ctx.callID } : {}),
        }
        return Effect.gen(function* () {
          const decoded = yield* decode(args).pipe(
            Effect.mapError((error) =>
              toolInfo.formatValidationError
                ? new Error(toolInfo.formatValidationError(error), { cause: error })
                : new Error(
                    `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
                    { cause: error },
                  ),
            ),
          )

          // AIDefence: scan tool input for prompt injection / PII threats
          const inputText = JSON.stringify(decoded)
          const inputThreat = aidefenceScan(inputText)
          if (inputThreat.level === "critical") {
            const types = inputThreat.threats.map((t) => `${t.type}/${t.pattern}`).join(", ")
            log.warn("AIDefence blocked tool input", { tool: id, threats: types })
            throw new Error(
              `Security threat detected in tool input [${types}]. Tool execution blocked. Review and sanitize the input before retrying.`,
            )
          }
          if (inputThreat.level === "warning") {
            log.warn("AIDefence warning on tool input", {
              tool: id,
              threats: inputThreat.threats.map((t) => t.type + "/" + t.pattern),
            })
          }

          // Plugin hooks (tool.execute.before / tool.execute.after) — optional: no-op if Plugin not in scope (e.g. tests)
          const pluginOpt = yield* Effect.serviceOption(Plugin.Service)
          const beforeOutput = { args: decoded }
          if (Option.isSome(pluginOpt)) {
            yield* pluginOpt.value.trigger("tool.execute.before", { tool: id, sessionID: ctx.sessionID, callID: ctx.callID ?? "" }, beforeOutput)
          }

          const result = yield* execute(beforeOutput.args as Schema.Schema.Type<Parameters>, ctx)

          const afterOutput = { title: result.title, output: result.output, metadata: result.metadata }
          if (Option.isSome(pluginOpt)) {
            yield* pluginOpt.value.trigger("tool.execute.after", { tool: id, sessionID: ctx.sessionID, callID: ctx.callID ?? "", args: beforeOutput.args }, afterOutput)
          }

          // AIDefence: warn if output contains critical threats (don't block — output may contain searched-for content)
          const outputThreat = aidefenceScan(afterOutput.output)
          if (outputThreat.level === "critical") {
            log.warn("AIDefence warning on tool output", {
              tool: id,
              threats: outputThreat.threats.map((t) => t.type + "/" + t.pattern),
            })
          }

          if (result.metadata.truncated !== undefined) {
            return { ...result, output: afterOutput.output }
          }
          const agent = yield* agents.get(ctx.agent)
          const truncated = yield* truncate.output(afterOutput.output, {}, agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: truncated.outputPath }),
            },
          }
        }).pipe(Effect.orDie, Effect.withSpan("Tool.execute", { attributes: attrs }))
      }
      return toolInfo
    })
}

export function define<
  Parameters extends Schema.Decoder<unknown>,
  Result extends Metadata,
  R,
  ID extends string = string,
>(
  id: ID,
  init: Effect.Effect<Init<Parameters, Result>, never, R>,
): Effect.Effect<Info<Parameters, Result>, never, R | Truncate.Service | Agent.Service> & { id: ID } {
  return Object.assign(
    Effect.gen(function* () {
      const resolved = yield* init
      const truncate = yield* Truncate.Service
      const agents = yield* Agent.Service
      return { id, init: wrap(id, resolved, truncate, agents) }
    }),
    { id },
  )
}

export function init<P extends Schema.Decoder<unknown>, M extends Metadata>(
  info: Info<P, M>,
): Effect.Effect<Def<P, M>> {
  return Effect.gen(function* () {
    const init = yield* info.init()
    return {
      ...init,
      id: info.id,
    }
  })
}

export * as Tool from "./tool"
