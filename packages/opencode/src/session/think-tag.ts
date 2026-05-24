import { EventEmitter } from "events"

const OPEN_TAG = "<think>"
const CLOSE_TAG = "</think>"

/**
 * Streaming parser for DeepSeek/Kimi <think>...</think> reasoning blocks.
 * Emits reasoning-start, reasoning-delta, reasoning-end, and text-delta events.
 * Feed it raw text delta chunks; it handles tags split across chunk boundaries.
 */
export class ThinkTagParser extends EventEmitter {
  private buffer = ""
  private inThink = false

  feed(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.inThink) {
        const closeIdx = this.buffer.indexOf(CLOSE_TAG)
        if (closeIdx === -1) {
          // More reasoning content coming — emit what we have, keep nothing
          this.emit("reasoning-delta", this.buffer)
          this.buffer = ""
        } else {
          // Emit up to the close tag, then end reasoning
          if (closeIdx > 0) this.emit("reasoning-delta", this.buffer.slice(0, closeIdx))
          this.emit("reasoning-end")
          this.inThink = false
          this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length)
        }
      } else {
        const openIdx = this.buffer.indexOf(OPEN_TAG)
        if (openIdx === -1) {
          // No complete open tag found. Check if the tail of the buffer could be
          // the start of a partial <think> tag that will complete on the next chunk.
          const holdLen = this.partialPrefixLen(this.buffer, OPEN_TAG)
          const safeLen = this.buffer.length - holdLen
          if (safeLen > 0) {
            this.emit("text-delta", this.buffer.slice(0, safeLen))
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        } else {
          // Emit text before the open tag
          if (openIdx > 0) this.emit("text-delta", this.buffer.slice(0, openIdx))
          this.emit("reasoning-start")
          this.inThink = true
          this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length)
        }
      }
    }
  }

  /**
   * Returns the length of the longest suffix of `text` that is a prefix of `tag`.
   * This is the number of chars we must hold back to avoid splitting a partial tag.
   */
  private partialPrefixLen(text: string, tag: string): number {
    const maxCheck = Math.min(tag.length - 1, text.length)
    for (let len = maxCheck; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len
    }
    return 0
  }

  /** Call at stream end to flush any remaining buffer as text. */
  flush(): void {
    if (this.buffer.length > 0) {
      this.emit("text-delta", this.buffer)
      this.buffer = ""
    }
  }
}

/** Returns true for model IDs that use <think> XML tags instead of native reasoning events. */
export function usesThinkTags(modelID: string): boolean {
  const lower = modelID.toLowerCase()
  return (
    lower.includes("deepseek-r") ||
    lower.includes("deepseek-reasoner") ||
    lower.includes("kimi-k1") ||
    lower.includes("moonshot-v1-thinking")
  )
}
