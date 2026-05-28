/**
 * Flat vector search with cosine similarity.
 * O(n) scan — MVP fallback until an HNSW backend is added for large archives.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom < 1e-8) return 0
  return dot / denom
}

export function topK(
  query: number[],
  entries: Array<{ id: string; vector: number[] }>,
  k: number,
): Array<{ id: string; score: number }> {
  return entries
    .map((e) => ({ id: e.id, score: cosineSimilarity(query, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
