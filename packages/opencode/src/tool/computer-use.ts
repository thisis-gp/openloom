import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "tool.computer-use" })

export const ComputerUseParams = Schema.Struct({
  action: Schema.Literals(["screenshot", "click", "double_click", "right_click", "move", "type", "key", "scroll"]),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.Literals(["up", "down", "left", "right"])),
  amount: Schema.optional(Schema.Number),
})

type Params = Schema.Schema.Type<typeof ComputerUseParams>

export function validateComputerUseAction(params: Partial<Params>): void {
  switch (params.action) {
    case "click":
    case "double_click":
    case "right_click":
    case "move":
      if (params.x == null || params.y == null) throw new Error(`${params.action} requires x and y`)
      break
    case "type":
      if (!params.text) throw new Error("type requires text")
      break
    case "key":
      if (!params.key) throw new Error("key requires key name")
      break
    case "scroll":
      if (!params.direction) throw new Error("scroll requires direction")
      break
    case "screenshot":
      break
  }
}

export const ComputerUseTool = Tool.define(
  "computer_use",
  Effect.succeed({
    description:
      "Control the computer: take screenshots, move the mouse, click, type text, press keys, and scroll. Use screenshot first to understand the current screen state before interacting.",
    parameters: ComputerUseParams,
    execute(params: Schema.Schema.Type<typeof ComputerUseParams>, _ctx: Tool.Context) {
      return Effect.gen(function* () {
        validateComputerUseAction(params)
        log.info("computer_use", { action: params.action })

        // Lazy import to avoid loading nut-js at startup
        const nutJs = yield* Effect.promise(() => import("@nut-tree-fork/nut-js"))
        const { screenshot, mouse, keyboard, Button, Key } = nutJs as any

        switch (params.action) {
          case "screenshot": {
            const img = yield* Effect.promise(() => screenshot())
            const width = (img as any).width
            const height = (img as any).height
            return {
              title: "Screenshot taken",
              metadata: {},
              output: `Screenshot captured: ${width}x${height} pixels`,
            }
          }

          case "click": {
            yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
            yield* Effect.promise(() => mouse.click(Button.LEFT))
            return {
              title: `Clicked at (${params.x}, ${params.y})`,
              metadata: {},
              output: `Left-clicked at (${params.x}, ${params.y})`,
            }
          }

          case "double_click": {
            yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
            yield* Effect.promise(() => mouse.doubleClick(Button.LEFT))
            return {
              title: `Double-clicked at (${params.x}, ${params.y})`,
              metadata: {},
              output: `Double-clicked at (${params.x}, ${params.y})`,
            }
          }

          case "right_click": {
            yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
            yield* Effect.promise(() => mouse.click(Button.RIGHT))
            return {
              title: `Right-clicked at (${params.x}, ${params.y})`,
              metadata: {},
              output: `Right-clicked at (${params.x}, ${params.y})`,
            }
          }

          case "move": {
            yield* Effect.promise(() => mouse.setPosition({ x: params.x!, y: params.y! }))
            return {
              title: `Moved mouse to (${params.x}, ${params.y})`,
              metadata: {},
              output: `Mouse moved to (${params.x}, ${params.y})`,
            }
          }

          case "type": {
            yield* Effect.promise(() => keyboard.type(params.text!))
            return {
              title: "Typed text",
              metadata: {},
              output: `Typed: ${params.text!.slice(0, 40)}${params.text!.length > 40 ? "..." : ""}`,
            }
          }

          case "key": {
            const keyCode = (Key as any)[params.key!]
            if (keyCode == null) {
              return {
                title: "Unknown key",
                metadata: {},
                output: `Unknown key: ${params.key}`,
              }
            }
            yield* Effect.promise(() => keyboard.pressKey(keyCode))
            yield* Effect.promise(() => keyboard.releaseKey(keyCode))
            return {
              title: `Pressed key ${params.key}`,
              metadata: {},
              output: `Pressed key: ${params.key}`,
            }
          }

          case "scroll": {
            const pos =
              params.x != null && params.y != null
                ? { x: params.x, y: params.y }
                : yield* Effect.promise(() => mouse.getPosition())
            const amount = params.amount ?? 3
            yield* Effect.promise(() => mouse.setPosition(pos))
            if (params.direction === "down") yield* Effect.promise(() => mouse.scrollDown(amount))
            else if (params.direction === "up") yield* Effect.promise(() => mouse.scrollUp(amount))
            else if (params.direction === "left") yield* Effect.promise(() => mouse.scrollLeft(amount))
            else yield* Effect.promise(() => mouse.scrollRight(amount))
            return {
              title: `Scrolled ${params.direction}`,
              metadata: {},
              output: `Scrolled ${params.direction} ${amount} clicks at (${(pos as any).x}, ${(pos as any).y})`,
            }
          }

          default:
            return {
              title: "Unknown action",
              metadata: {},
              output: `Unknown action: ${(params as any).action}`,
            }
        }
      })
    },
  }),
)
