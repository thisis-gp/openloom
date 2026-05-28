export type EntityType = "file" | "function" | "decision" | "person" | "concept"
export type RelationType = "references" | "modifies" | "decides" | "mentions" | "depends_on"

export interface Entity {
  type: EntityType
  label: string
}

export interface Relation {
  from: string
  to: string
  relation: RelationType
}

export interface ExtractionResult {
  entities: Entity[]
  relations: Relation[]
}

const FILE_PATTERN = /\b([\w/-]+\.(ts|tsx|js|jsx|py|go|sql|md|json|yaml|toml))\b/g
const FUNCTION_PATTERN = /\b([a-z][a-zA-Z0-9]+(?:Service|Tool|Layer|Table|Handler|Router|Store|Hook|Context))\b/g
const DECISION_PATTERN =
  /\b(decid(?:ed?|ing)|choos?(?:e|ing|es?)|opt(?:ed?|ing) for|us(?:e|ing) .{1,30} instead|replac(?:e|ing)|switch(?:ed?|ing) to)\b/gi
const CONCEPT_PATTERN =
  /\b(authentication|authorization|caching|pagination|migration|schema|routing|middleware|webhook|streaming)\b/gi

export function extractEntities(text: string): ExtractionResult {
  if (text.length < 10) return { entities: [], relations: [] }

  const entities: Entity[] = []
  const seen = new Set<string>()

  const addEntity = (type: EntityType, label: string) => {
    const key = `${type}:${label}`
    if (!seen.has(key) && entities.length < 15) {
      seen.add(key)
      entities.push({ type, label })
    }
  }

  for (const match of text.matchAll(FILE_PATTERN)) {
    addEntity("file", match[1]!)
  }
  for (const match of text.matchAll(FUNCTION_PATTERN)) {
    addEntity("function", match[1]!)
  }
  for (const match of text.matchAll(DECISION_PATTERN)) {
    const start = Math.max(0, match.index!)
    const end = Math.min(text.length, match.index! + 80)
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim()
    addEntity("decision", snippet.slice(0, 100))
  }
  for (const match of text.matchAll(CONCEPT_PATTERN)) {
    addEntity("concept", match[1]!.toLowerCase())
  }

  const relations: Relation[] = []
  const fileEntities = entities.filter((e) => e.type === "file")
  const funcEntities = entities.filter((e) => e.type === "function")

  for (const file of fileEntities) {
    for (const func of funcEntities) {
      relations.push({ from: func.label, to: file.label, relation: "references" })
    }
  }

  return { entities, relations }
}
