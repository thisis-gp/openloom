import { PRUNE_MINIMUM, REFERENCE_ONLY_SUMMARY_PREFIX } from "./compaction"

export type CompressionStrategy = "abstract" | "detail-prune" | "reasoning-aware" | "default"

/**
 * Chooses the best compression strategy given the token overflow amount.
 * - reasoning-aware: preferred when session has reasoning blocks (preserves thought chains)
 * - abstract: large overflow — maximum compression, discard implementation details
 * - detail-prune: moderate overflow — keep decisions, prune verbose tool outputs
 * - default: fallback to existing summary approach
 */
export function selectStrategy(
  currentTokens: number,
  pruneMinimum: number,
  hasReasoning = false,
): CompressionStrategy {
  const overflow = currentTokens - pruneMinimum
  if (overflow <= 0) return "default"
  if (hasReasoning && overflow >= pruneMinimum * 0.25) return "reasoning-aware"
  if (overflow >= pruneMinimum * 2) return "abstract"
  if (overflow >= pruneMinimum * 0.5) return "detail-prune"
  return "default"
}

export function abstractStrategy(previousSummary: string | undefined, currentTokens: number): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}The context is ${currentTokens} tokens — critically over limit. Create a maximally abstract summary.`,
    "Discard all implementation details, code snippets, and tool outputs.",
    "Preserve only: the original goal, key decisions made, final state of each file changed, and next steps.",
    "Target: under 800 tokens total.",
  ].join("\n")
}

export function detailPruneStrategy(previousSummary: string | undefined): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}Context is over limit. Summarize with moderate compression.`,
    "Keep: decisions and why they were made, error messages and resolutions, file paths and their purpose.",
    "Remove: verbose implementation detail, repeated tool output, scaffolding exploration.",
    "Target: under 1500 tokens total.",
  ].join("\n")
}

export function reasoningAwareStrategy(previousSummary: string | undefined): string {
  const anchor = previousSummary
    ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`
    : ""
  return [
    REFERENCE_ONLY_SUMMARY_PREFIX,
    `${anchor}Context is over limit. This session contains reasoning chains — preserve them selectively.`,
    "Keep: the most important reasoning chain that led to a key decision.",
    "Remove: exploratory reasoning that didn't produce a decision, all implementation detail.",
    "Keep: goal, final decisions, current file state, next steps.",
    "Target: under 1200 tokens total.",
  ].join("\n")
}

// Re-export PRUNE_MINIMUM for convenience (used by callers who import from this module)
export { PRUNE_MINIMUM }
