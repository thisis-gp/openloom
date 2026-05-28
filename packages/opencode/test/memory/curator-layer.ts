import { Effect, Layer } from "effect"
import { CuratorService } from "@/memory/curator/curator"
import { GraphService } from "@/memory/graph/graph"
import { VectorService } from "@/memory/vector/vector"

/** Test layer: curator + graph + no-op vector (avoids provider/auth deps). */
export const testCuratorLayer = CuratorService.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      GraphService.defaultLayer,
      Layer.succeed(
        VectorService.Service,
        VectorService.Service.of({
          index: () => Effect.succeed(null),
          search: () => Effect.succeed([]),
        }),
      ),
    ),
  ),
)
