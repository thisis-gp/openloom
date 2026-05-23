import { Layer } from "effect"
import { CuratorService } from "./curator/curator"
import { VectorService } from "./vector/vector"
import { GraphService } from "./graph/graph"

export { CuratorService } from "./curator/curator"
export { VectorService } from "./vector/vector"
export { GraphService } from "./graph/graph"
export { MemoryGraphTool } from "./graph/graph-tool"

export const MemoryLayer = CuratorService.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(VectorService.defaultLayer, GraphService.defaultLayer)),
)
