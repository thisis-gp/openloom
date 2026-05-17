import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.OPENLOOM_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
