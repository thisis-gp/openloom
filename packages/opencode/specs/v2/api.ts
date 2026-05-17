// @ts-nocheck

import { Openloom } from "@openloom/core"
import { ReadTool } from "@openloom/core/tools"

const openloom = Openloom.make({})

openloom.tool.add(ReadTool)

openloom.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

openloom.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

openloom.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await openloom.session.create({
  agent: "build",
})

openloom.subscribe((event) => {
  console.log(event)
})

await openloom.session.prompt({
  sessionID,
  text: "hey what is up",
})

await openloom.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await openloom.session.wait()

console.log(await openloom.session.messages(sessionID))
