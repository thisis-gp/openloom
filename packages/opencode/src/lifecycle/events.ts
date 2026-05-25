import { Schema } from "effect"
import { BusEvent } from "@/bus/bus-event"
import { SessionID, MessageID } from "@/session/schema"

export const LifecycleEvent = {
  // Session lifecycle
  SessionStarted: BusEvent.define(
    "lifecycle.session.started",
    Schema.Struct({ sessionID: SessionID, title: Schema.optional(Schema.String) }),
  ),
  SessionEnded: BusEvent.define(
    "lifecycle.session.ended",
    Schema.Struct({ sessionID: SessionID, messageCount: Schema.Number }),
  ),

  // Message lifecycle
  MessageStarted: BusEvent.define(
    "lifecycle.message.started",
    Schema.Struct({ sessionID: SessionID, messageID: MessageID, modelID: Schema.String }),
  ),
  MessageCompleted: BusEvent.define(
    "lifecycle.message.completed",
    Schema.Struct({
      sessionID: SessionID,
      messageID: MessageID,
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      costUsd: Schema.optional(Schema.Number),
    }),
  ),

  // Tool lifecycle
  ToolBefore: BusEvent.define(
    "lifecycle.tool.before",
    Schema.Struct({ sessionID: SessionID, messageID: MessageID, toolID: Schema.String, args: Schema.Unknown }),
  ),
  ToolAfter: BusEvent.define(
    "lifecycle.tool.after",
    Schema.Struct({
      sessionID: SessionID,
      messageID: MessageID,
      toolID: Schema.String,
      success: Schema.Boolean,
      durationMs: Schema.Number,
    }),
  ),

  // Compaction lifecycle
  CompactionBefore: BusEvent.define(
    "lifecycle.compaction.before",
    Schema.Struct({ sessionID: SessionID, currentTokens: Schema.Number }),
  ),
  CompactionAfter: BusEvent.define(
    "lifecycle.compaction.after",
    Schema.Struct({ sessionID: SessionID, compressedTokens: Schema.Number, strategy: Schema.String }),
  ),

  // Agent lifecycle
  AgentStarted: BusEvent.define(
    "lifecycle.agent.started",
    Schema.Struct({ sessionID: SessionID, agentID: Schema.String }),
  ),
  AgentCompleted: BusEvent.define(
    "lifecycle.agent.completed",
    Schema.Struct({ sessionID: SessionID, agentID: Schema.String, success: Schema.Boolean }),
  ),

  // Provider lifecycle
  ProviderSelected: BusEvent.define(
    "lifecycle.provider.selected",
    Schema.Struct({ sessionID: SessionID, modelID: Schema.String, providerID: Schema.String, reason: Schema.String }),
  ),
} as const

const ALL_TYPES: Set<string> = new Set(Object.values(LifecycleEvent).map((e) => e.type))

export function isLifecycleEventType(type: string): boolean {
  return ALL_TYPES.has(type)
}

export type LifecycleEventType = (typeof LifecycleEvent)[keyof typeof LifecycleEvent]["type"]
