/**
 * HNSW (Hierarchical Navigable Small World) vector index.
 * O(log n) approximate nearest neighbour — use when archive size >= 500.
 * Falls back to flat scan (flat.ts) for smaller archives.
 */
import { HierarchicalNSW } from "hnswlib-node"

export class HnswIndex {
  private index: HierarchicalNSW
  private labelToId = new Map<number, string>()
  private idToLabel = new Map<string, number>()
  private nextLabel = 0
  private dim: number

  constructor(dim: number, maxElements = 10_000) {
    this.dim = dim
    this.index = new HierarchicalNSW("cosine", dim)
    this.index.initIndex(maxElements)
  }

  get size(): number {
    return this.nextLabel
  }

  add(id: string, vector: number[]): void {
    if (vector.length !== this.dim) return
    if (this.idToLabel.has(id)) return
    const label = this.nextLabel++
    this.index.addPoint(vector, label)
    this.labelToId.set(label, id)
    this.idToLabel.set(id, label)
  }

  search(query: number[], k: number): Array<{ id: string; score: number }> {
    if (this.nextLabel === 0) return []
    const count = Math.min(k, this.nextLabel)
    const result = this.index.searchKnn(query, count)
    return result.neighbors.map((label: number, i: number) => ({
      id: this.labelToId.get(label) ?? "",
      score: 1 - (result.distances[i] ?? 0),
    }))
  }

  has(id: string): boolean {
    return this.idToLabel.has(id)
  }
}
