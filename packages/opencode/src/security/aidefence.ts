export type ThreatLevel = "safe" | "warning" | "critical"

export type ThreatType = "prompt-injection" | "pii" | "path-traversal"

export interface Threat {
  type: ThreatType
  pattern: string
  match: string
}

export interface ThreatResult {
  level: ThreatLevel
  threats: Array<Threat>
}

// ---------------------------------------------------------------------------
// Gate 1: Prompt Injection
// ---------------------------------------------------------------------------

const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Role hijack
  { pattern: /ignore (all )?(previous|above) instructions/i, label: "ignore-previous-instructions" },
  { pattern: /you are now/i, label: "you-are-now" },
  { pattern: /\bact as\b/i, label: "act-as" },
  { pattern: /\bnew persona\b/i, label: "new-persona" },
  { pattern: /pretend (you are|to be)/i, label: "pretend-you-are" },
  // Jailbreak markers
  { pattern: /\bDAN mode\b/i, label: "dan-mode" },
  { pattern: /\bgod mode\b/i, label: "god-mode" },
  { pattern: /\bdeveloper mode\b/i, label: "developer-mode" },
  { pattern: /\bjailbreak\b/i, label: "jailbreak" },
  { pattern: /bypass (your )?(restrictions|guidelines|rules)/i, label: "bypass-restrictions" },
  // Instruction injection
  { pattern: /\[SYSTEM\]/i, label: "system-tag-bracket" },
  { pattern: /<system>/i, label: "system-tag-html" },
  { pattern: /### (new )?instruction/i, label: "markdown-instruction" },
  { pattern: /<!--.*instruction/i, label: "html-comment-instruction" },
]

export function scanPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(({ pattern }) => pattern.test(text))
}

function collectPromptInjectionThreats(text: string): Array<Threat> {
  const threats: Array<Threat> = []
  for (const { pattern, label } of PROMPT_INJECTION_PATTERNS) {
    const m = text.match(pattern)
    if (m) {
      threats.push({ type: "prompt-injection", pattern: label, match: m[0] })
    }
  }
  return threats
}

// ---------------------------------------------------------------------------
// Gate 2: PII Detection (14 types)
// ---------------------------------------------------------------------------

const PII_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "email", pattern: /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/ },
  { label: "us-ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: "us-phone", pattern: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { label: "credit-card", pattern: /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/ },
  { label: "ipv4", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { label: "api-key-generic", pattern: /\b(sk|pk|api|key)[-_][a-zA-Z0-9]{20,}\b/ },
  { label: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "github-token", pattern: /\bghp_[a-zA-Z0-9]{36}\b/ },
  { label: "private-key-header", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "jwt", pattern: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/ },
  { label: "bitcoin-address", pattern: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/ },
  { label: "uk-nin", pattern: /\b[A-Z]{2}\d{6}[A-D]\b/ },
  { label: "password-in-text", pattern: /(?:password|passwd|secret)\s*[:=]\s*\S+/i },
  { label: "connection-string", pattern: /(?:mongodb|postgresql|mysql|redis):\/\/[^\s]+/i },
]

/**
 * Returns the labels of all PII types found in the text.
 */
export function scanPII(text: string): string[] {
  const found: string[] = []
  for (const { label, pattern } of PII_PATTERNS) {
    if (pattern.test(text)) {
      found.push(label)
    }
  }
  return found
}

function collectPIIThreats(text: string): Array<Threat> {
  const threats: Array<Threat> = []
  for (const { label, pattern } of PII_PATTERNS) {
    const m = text.match(pattern)
    if (m) {
      threats.push({ type: "pii", pattern: label, match: m[0] })
    }
  }
  return threats
}

// ---------------------------------------------------------------------------
// Gate 3: Path Traversal
// ---------------------------------------------------------------------------

const PATH_TRAVERSAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\.\.[/\\]/, label: "directory-traversal" },
  { pattern: /\/etc\/|\/proc\/|\/sys\//, label: "sensitive-unix-path" },
  { pattern: /C:\\Windows\\/i, label: "sensitive-windows-path" },
  { pattern: /\x00/, label: "null-byte" },
]

export function scanPathTraversal(text: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(({ pattern }) => pattern.test(text))
}

function collectPathTraversalThreats(text: string): Array<Threat> {
  const threats: Array<Threat> = []
  for (const { pattern, label } of PATH_TRAVERSAL_PATTERNS) {
    const m = text.match(pattern)
    if (m) {
      threats.push({ type: "path-traversal", pattern: label, match: m[0] })
    }
  }
  return threats
}

// ---------------------------------------------------------------------------
// Unified scan
// ---------------------------------------------------------------------------

export function scan(text: string): ThreatResult {
  const injectionThreats = collectPromptInjectionThreats(text)
  const piiThreats = collectPIIThreats(text)
  const traversalThreats = collectPathTraversalThreats(text)

  const threats: Array<Threat> = [...injectionThreats, ...piiThreats, ...traversalThreats]

  let level: ThreatLevel = "safe"

  if (injectionThreats.length > 0 || piiThreats.length >= 3) {
    level = "critical"
  } else if (piiThreats.length > 0 || traversalThreats.length > 0) {
    level = "warning"
  }

  return { level, threats }
}

export * as AIDefence from "./aidefence"
