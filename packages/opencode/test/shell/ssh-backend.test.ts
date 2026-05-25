import { describe, expect, it } from "bun:test"
import { type SshConnectionOptions, validateSshOptions } from "../../src/shell/backends/ssh"

describe("validateSshOptions", () => {
  it("accepts password auth", () => {
    const opts: SshConnectionOptions = { host: "localhost", port: 22, username: "user", password: "pass" }
    expect(() => validateSshOptions(opts)).not.toThrow()
  })
  it("accepts key auth", () => {
    const opts: SshConnectionOptions = { host: "host", port: 22, username: "user", privateKey: "/path/to/key" }
    expect(() => validateSshOptions(opts)).not.toThrow()
  })
  it("rejects missing auth", () => {
    const opts: SshConnectionOptions = { host: "host", port: 22, username: "user" }
    expect(() => validateSshOptions(opts)).toThrow("SSH requires either password or privateKey")
  })
})
