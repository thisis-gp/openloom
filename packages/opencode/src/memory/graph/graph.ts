import { Effect, Layer, Context } from "effect"
import { eq, and } from "drizzle-orm"
import { Database } from "@/storage/db"
import { GraphNodeTable, GraphEdgeTable } from "./graph.sql"
import { SessionID } from "@/session/schema"
import { extractEntities } from "./extractor"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "memory.graph" })

/** Weighted label propagation — assigns community_id from neighbor labels. */
function propagateLabels(
  nodeIDs: string[],
  edges: Array<{ from: string; to: string; weight: number }>,
  iterations = 10,
): Map<string, string> {
  const labels = new Map(nodeIDs.map((id) => [id, id]))
  if (nodeIDs.length === 0) return labels
  const neighbors = new Map<string, Array<{ id: string; weight: number }>>()
  for (const id of nodeIDs) neighbors.set(id, [])
  for (const edge of edges) {
    neighbors.get(edge.from)?.push({ id: edge.to, weight: edge.weight })
    neighbors.get(edge.to)?.push({ id: edge.from, weight: edge.weight })
  }
  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, string>()
    for (const id of nodeIDs) {
      const votes = new Map<string, number>()
      for (const n of neighbors.get(id) ?? []) {
        const label = labels.get(n.id) ?? n.id
        votes.set(label, (votes.get(label) ?? 0) + n.weight)
      }
      let best = labels.get(id) ?? id
      let bestScore = -1
      for (const [label, score] of votes) {
        if (score > bestScore) {
          bestScore = score
          best = label
        }
      }
      next.set(id, best)
    }
    for (const [k, v] of next) labels.set(k, v)
  }
  return labels
}

function computePagerank(
  nodeIDs: string[],
  edges: Array<{ from: string; to: string; weight: number }>,
  iterations = 20,
  damping = 0.85,
): Map<string, number> {
  const n = nodeIDs.length
  if (n === 0) return new Map()
  const scores = new Map(nodeIDs.map((id) => [id, 1.0 / n]))
  for (let i = 0; i < iterations; i++) {
    const next = new Map(nodeIDs.map((id) => [id, (1 - damping) / n]))
    for (const edge of edges) {
      const outDegree = edges.filter((e) => e.from === edge.from).length
      if (outDegree > 0) {
        const contribution = (damping * (scores.get(edge.from) ?? 0) * edge.weight) / outDegree
        next.set(edge.to, (next.get(edge.to) ?? 0) + contribution)
      }
    }
    for (const [k, v] of next) scores.set(k, v)
  }
  return scores
}

export interface Interface {
  readonly ingest: (input: {
    archiveID: string
    sessionID: SessionID
    content: string
  }) => Effect.Effect<{ nodesAdded: number; edgesAdded: number }>

  readonly query: (input: {
    question: string
    limit?: number
  }) => Effect.Effect<
    Array<{
      node: { id: string; type: string; label: string; score: number }
      relatedNodes: Array<{ id: string; type: string; label: string; relation: string }>
    }>
  >

  readonly recomputePagerank: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openloom/GraphService") {}

export const layer: Layer.Layer<Service> = Layer.succeed(
  Service,
  Service.of({
    ingest: ({ sessionID, content }) =>
      Effect.sync(() => {
        const { entities, relations } = extractEntities(content)
        let nodesAdded = 0
        let edgesAdded = 0
        const now = Date.now()
        const nodeIDMap = new Map<string, string>()

        for (const entity of entities) {
          const existing = Database.use((db) =>
            db
              .select()
              .from(GraphNodeTable)
              .where(
                and(
                  eq(GraphNodeTable.session_id, sessionID),
                  eq(GraphNodeTable.type, entity.type),
                  eq(GraphNodeTable.label, entity.label),
                ),
              )
              .get(),
          )
          if (existing) {
            nodeIDMap.set(entity.label, existing.id)
            continue
          }
          const id = crypto.randomUUID()
          nodeIDMap.set(entity.label, id)
          Database.use((db) =>
            db
              .insert(GraphNodeTable)
              .values({
                id,
                session_id: sessionID,
                type: entity.type,
                label: entity.label,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          nodesAdded++
        }

        for (const rel of relations) {
          const fromID = nodeIDMap.get(rel.from)
          const toID = nodeIDMap.get(rel.to)
          if (!fromID || !toID) continue
          Database.use((db) =>
            db
              .insert(GraphEdgeTable)
              .values({
                id: crypto.randomUUID(),
                from_node_id: fromID,
                to_node_id: toID,
                relation: rel.relation,
                session_id: sessionID,
                time_created: now,
                time_updated: now,
              })
              .onConflictDoNothing()
              .run(),
          )
          edgesAdded++
        }

        log.info("graph ingest", { sessionID, nodesAdded, edgesAdded })
        return { nodesAdded, edgesAdded }
      }),

    query: ({ question, limit = 10 }) =>
      Effect.sync(() => {
        const terms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
        const allNodes = Database.use((db) => db.select().from(GraphNodeTable).all())
        const matched = allNodes
          .filter((node) => terms.some((t) => node.label.toLowerCase().includes(t)))
          .sort((a, b) => b.pagerank_score - a.pagerank_score)
          .slice(0, limit)

        return matched.map((node) => {
          const edges = Database.use((db) =>
            db.select().from(GraphEdgeTable).where(eq(GraphEdgeTable.from_node_id, node.id)).all(),
          )
          const relatedNodes = edges.flatMap((edge) => {
            const related = Database.use((db) =>
              db.select().from(GraphNodeTable).where(eq(GraphNodeTable.id, edge.to_node_id)).get(),
            )
            if (!related) return []
            return [{ id: related.id, type: related.type, label: related.label, relation: edge.relation }]
          })

          return {
            node: { id: node.id, type: node.type, label: node.label, score: node.pagerank_score },
            relatedNodes,
          }
        })
      }),

    recomputePagerank: () =>
      Effect.sync(() => {
        const nodes = Database.use((db) => db.select().from(GraphNodeTable).all())
        const edges = Database.use((db) =>
          db
            .select()
            .from(GraphEdgeTable)
            .all()
            .map((e) => ({ from: e.from_node_id, to: e.to_node_id, weight: e.weight })),
        )
        const scores = computePagerank(
          nodes.map((n) => n.id),
          edges,
        )
        const communities = propagateLabels(
          nodes.map((n) => n.id),
          edges,
        )
        for (const node of nodes) {
          Database.use((db) =>
            db
              .update(GraphNodeTable)
              .set({
                pagerank_score: scores.get(node.id) ?? 0,
                community_id: communities.get(node.id) ?? node.id,
              })
              .where(eq(GraphNodeTable.id, node.id))
              .run(),
          )
        }
      }),
  }),
)

export const defaultLayer = layer

export * as GraphService from "./graph"
