declare global {
  const OPENLOOM_VERSION: string
  const OPENLOOM_CHANNEL: string
}

export const InstallationVersion = typeof OPENLOOM_VERSION === "string" ? OPENLOOM_VERSION : "local"
export const InstallationChannel = typeof OPENLOOM_CHANNEL === "string" ? OPENLOOM_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
