import { describe, expect, it } from "bun:test"
import { validateComputerUseAction } from "../../src/tool/computer-use"

describe("validateComputerUseAction", () => {
  it("accepts screenshot action", () => {
    expect(() => validateComputerUseAction({ action: "screenshot" })).not.toThrow()
  })
  it("accepts click with coordinates", () => {
    expect(() => validateComputerUseAction({ action: "click", x: 100, y: 200 })).not.toThrow()
  })
  it("rejects click without coordinates", () => {
    expect(() => validateComputerUseAction({ action: "click" })).toThrow("click requires x and y")
  })
  it("accepts type with text", () => {
    expect(() => validateComputerUseAction({ action: "type", text: "hello" })).not.toThrow()
  })
  it("rejects type without text", () => {
    expect(() => validateComputerUseAction({ action: "type" })).toThrow("type requires text")
  })
  it("accepts scroll with direction", () => {
    expect(() => validateComputerUseAction({ action: "scroll", direction: "down", amount: 3 })).not.toThrow()
  })
})
