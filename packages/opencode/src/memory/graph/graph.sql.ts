import { sqliteTable, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../../session/session.sql"
import { Timestamps } from "../../storage/schema.sql"
import type { SessionID } from "../../session/schema"

export type GraphNodeType = "file" | "function" | "decision" | "person" | "concept"
export type GraphEdgeRelation = "references" | "modifies" | "decides" | "mentions" | "depends_on"

/**
 * Entities in the session knowledge graph.
 */
export const GraphNodeTable = sqliteTable(
  "graph_nodes",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<GraphNodeType>().notNull(),
    /** Human-readable label, e.g. file path or function name */
    label: text().notNull(),
    /** PageRank score, updated after each graph mutation */
    pagerank_score: real().notNull().default(0.0),
    /** Louvain community identifier, null until first community detection run */
    community_id: text(),
    ...Timestamps,
  },
  (table) => [
    index("graph_nodes_session_idx").on(table.session_id),
    index("graph_nodes_type_idx").on(table.type),
    uniqueIndex("graph_nodes_session_type_label_idx").on(table.session_id, table.type, table.label),
  ],
)

/**
 * Directed edges in the session knowledge graph.
 */
export const GraphEdgeTable = sqliteTable(
  "graph_edges",
  {
    id: text().primaryKey(),
    from_node_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    to_node_id: text()
      .notNull()
      .references(() => GraphNodeTable.id, { onDelete: "cascade" }),
    relation: text().$type<GraphEdgeRelation>().notNull(),
    weight: real().notNull().default(1.0),
    session_id: text().$type<SessionID>().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("graph_edges_from_node_idx").on(table.from_node_id),
    index("graph_edges_to_node_idx").on(table.to_node_id),
    index("graph_edges_session_idx").on(table.session_id),
    uniqueIndex("graph_edges_from_to_relation_idx").on(table.from_node_id, table.to_node_id, table.relation),
  ],
)
