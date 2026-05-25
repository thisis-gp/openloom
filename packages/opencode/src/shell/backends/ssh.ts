import { Client } from "ssh2"
import { readFileSync } from "fs"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "shell.ssh" })

export type SshConnectionOptions = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string  // path to key file or PEM string
  passphrase?: string
  timeout?: number     // ms, default 10_000
}

export type SshRunOptions = SshConnectionOptions & {
  cwd?: string
  env?: Record<string, string>
}

export function validateSshOptions(opts: SshConnectionOptions): void {
  if (!opts.password && !opts.privateKey) {
    throw new Error("SSH requires either password or privateKey")
  }
}

function resolveKey(privateKey: string): string | Buffer {
  // If it looks like a file path (no newlines, no PEM header), read from disk
  if (!privateKey.includes("\n") && !privateKey.includes("-----")) {
    try {
      return readFileSync(privateKey)
    } catch {
      throw new Error(`SSH private key file not found: ${privateKey}`)
    }
  }
  return privateKey
}

/**
 * Execute a shell command on a remote host over SSH.
 * Streams stdout+stderr to onData. Returns exit code.
 */
export async function sshRun(
  cmd: string,
  opts: SshRunOptions,
  onData: (chunk: string) => void,
): Promise<{ exitCode: number }> {
  validateSshOptions(opts)

  return new Promise((resolve) => {
    const client = new Client()

    const connectOpts: Parameters<Client["connect"]>[0] = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: opts.timeout ?? 10_000,
    }

    if (opts.password) {
      connectOpts.password = opts.password
    } else if (opts.privateKey) {
      connectOpts.privateKey = resolveKey(opts.privateKey)
      if (opts.passphrase) connectOpts.passphrase = opts.passphrase
    }

    client.on("ready", () => {
      let fullCmd = cmd
      if (opts.cwd) fullCmd = `cd ${JSON.stringify(opts.cwd)} && ${cmd}`
      if (opts.env) {
        const envPrefix = Object.entries(opts.env)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(" ")
        fullCmd = `${envPrefix} ${fullCmd}`
      }

      log.info("ssh exec", { host: opts.host, cmd: fullCmd.slice(0, 80) })

      client.exec(fullCmd, (err, stream) => {
        if (err) {
          onData(`SSH exec error: ${err.message}\n`)
          client.end()
          resolve({ exitCode: 1 })
          return
        }

        stream.on("data", (chunk: Buffer) => onData(chunk.toString()))
        stream.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()))
        stream.on("close", (code: number) => {
          client.end()
          resolve({ exitCode: code ?? 1 })
        })
      })
    })

    client.on("error", (err) => {
      onData(`SSH connection error: ${err.message}\n`)
      resolve({ exitCode: 1 })
    })

    client.connect(connectOpts)
  })
}

/** Returns true if the ssh2 package is available (it always is once installed). */
export function sshAvailable(): boolean {
  try {
    require("ssh2")
    return true
  } catch {
    return false
  }
}
