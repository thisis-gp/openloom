import { Effect } from "effect"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Provider, parseModel } from "@/provider/provider"
import * as Log from "@openloom/core/util/log"

const log = Log.create({ service: "memory.vector.embed" })

const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>
}

function apiKey(auth: Auth.Info | undefined, providerID: string) {
  if (auth?.type === "api") return auth.key
  if (auth?.type === "wellknown") return auth.token
  const envKey = process.env[`${providerID.toUpperCase().replace(/-/g, "_")}_API_KEY`]
  if (envKey) return envKey
  if (providerID === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  return undefined
}

function embeddingsUrl(baseURL: string) {
  const trimmed = baseURL.replace(/\/$/, "")
  if (trimmed.endsWith("/v1")) return `${trimmed}/embeddings`
  return `${trimmed}/v1/embeddings`
}

export const embedText = (text: string) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const cfg = yield* config.get()
    const provider = yield* Provider.Service
    const authSvc = yield* Auth.Service

    const modelRef = cfg.embedding_model ?? cfg.small_model ?? DEFAULT_EMBEDDING_MODEL
    const parsed = parseModel(modelRef)
    const model = yield* provider
      .getModel(parsed.providerID, parsed.modelID)
      .pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!model) {
      log.debug("embed skipped — model not found", { model: modelRef })
      return null
    }

    const auth = yield* authSvc.get(parsed.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))
    const key = apiKey(auth, parsed.providerID)
    if (!key) {
      log.debug("embed skipped — no API key", { providerID: parsed.providerID })
      return null
    }

    const baseURL = model.api.url
    if (!baseURL) return null

    const body = JSON.stringify({
      model: parsed.modelID,
      input: text.slice(0, 8_000),
    })

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(embeddingsUrl(baseURL), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body,
        }),
      catch: (err) => err,
    }).pipe(Effect.catch(() => Effect.succeed(undefined)))

    if (!response?.ok) {
      log.debug("embed request failed", { status: response?.status, model: modelRef })
      return null
    }

    const json = (yield* Effect.tryPromise({
      try: () => response.json() as Promise<EmbeddingResponse>,
      catch: () => new Error("invalid embedding response"),
    }).pipe(Effect.catch(() => Effect.succeed(undefined)))) as EmbeddingResponse | undefined

    const vector = json?.data?.[0]?.embedding
    if (!vector?.length) return null

    return { vector, model: `${parsed.providerID}/${parsed.modelID}` }
  })
