import { Config, ConfigProvider, Context, Effect, Layer } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("OPENLOOM_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: bool(name) }).pipe(Config.map((flags) => flags.experimental || flags.enabled))

export class Service extends ConfigService.Service<Service>()("@openloom/RuntimeFlags", {
  autoShare: bool("OPENLOOM_AUTO_SHARE"),
  pure: bool("OPENLOOM_PURE"),
  disableDefaultPlugins: bool("OPENLOOM_DISABLE_DEFAULT_PLUGINS"),
  disableChannelDb: bool("OPENLOOM_DISABLE_CHANNEL_DB"),
  disableEmbeddedWebUi: bool("OPENLOOM_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("OPENLOOM_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("OPENLOOM_DISABLE_LSP_DOWNLOAD"),
  skipMigrations: bool("OPENLOOM_SKIP_MIGRATIONS"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("OPENLOOM_DISABLE_CLAUDE_CODE"),
    direct: bool("OPENLOOM_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("OPENLOOM_DISABLE_CLAUDE_CODE"),
    direct: bool("OPENLOOM_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("OPENLOOM_ENABLE_EXA"),
    legacy: bool("OPENLOOM_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("OPENLOOM_ENABLE_PARALLEL"),
    legacy: bool("OPENLOOM_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("OPENLOOM_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("OPENLOOM_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("OPENLOOM_EXPERIMENTAL_SCOUT"),
  experimentalBackgroundSubagents: enabledByExperimental("OPENLOOM_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("OPENLOOM_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("OPENLOOM_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("OPENLOOM_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("OPENLOOM_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("OPENLOOM_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("OPENLOOM_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("OPENLOOM_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("OPENLOOM_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("OPENLOOM_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  client: Config.string("OPENLOOM_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.defaultLayer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const defaultLayer = Service.defaultLayer.pipe(Layer.orDie)

export * as RuntimeFlags from "./runtime-flags"
