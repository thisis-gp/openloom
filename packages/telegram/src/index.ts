import { Bot, type Context } from "grammy"
import { createOpencode, type ToolPart } from "@openloom/sdk"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

console.log("🚀 Starting OpenLoom Telegram bot...")
const openloom = await createOpencode({ port: 0 })
console.log("✅ OpenLoom server ready")

const bot = new Bot(BOT_TOKEN)

const sessions = new Map<number, { sessionId: string }>()

void (async () => {
  const events = await openloom.client.event.subscribe()
  for await (const event of events.stream) {
    if (event.type !== "message.part.updated") continue
    const part = event.properties.part
    if (part.type !== "tool") continue
    const toolPart = part as ToolPart
    if (toolPart.state.status !== "completed") continue

    for (const [chatId, session] of sessions.entries()) {
      if (session.sessionId !== toolPart.sessionID) continue
      const completedState = toolPart.state
      await bot.api
        .sendMessage(chatId, `🔧 *${toolPart.tool}* — ${completedState.title}`, {
          parse_mode: "Markdown",
        })
        .catch(() => {})
    }
  }
})()

bot.command("start", async (ctx: Context) => {
  await ctx.reply("👋 Hello! I'm your OpenLoom AI assistant. Send me a message to start coding.")
})

bot.command("reset", async (ctx: Context) => {
  const chatId = ctx.chat?.id
  if (!chatId) return
  sessions.delete(chatId)
  await ctx.reply("🔄 Session reset. Send a new message to start fresh.")
})

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id
  const text = ctx.message.text

  if (text.startsWith("/")) return

  let session = sessions.get(chatId)

  if (!session) {
    console.log("🆕 Creating new OpenLoom session for chat:", chatId)
    const createResult = await openloom.client.session.create({
      body: { title: `Telegram ${chatId}` },
    })

    if (createResult.error) {
      console.error("❌ Failed to create session:", createResult.error)
      await ctx.reply("Sorry, I had trouble creating a session. Please try again.")
      return
    }

    session = { sessionId: createResult.data.id }
    sessions.set(chatId, session)
    console.log("✅ Created OpenLoom session:", createResult.data.id)
  }

  const ack = await ctx.reply("⏳ Working on it...")

  try {
    const result = await openloom.client.session.prompt({
      path: { id: session.sessionId },
      body: { parts: [{ type: "text", text }] },
    })

    if (result.error) {
      console.error("❌ Failed to send message:", result.error)
      await bot.api.editMessageText(chatId, ack.message_id, "Sorry, I had trouble processing your message. Please try again.")
      return
    }

    const response = result.data
    const replyText =
      response.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") ||
      "I received your message but didn't have a response."

    await bot.api.editMessageText(chatId, ack.message_id, replyText, {
      parse_mode: "Markdown",
    })
  } catch (err) {
    console.error("❌ Unexpected error:", err)
    await bot.api
      .editMessageText(chatId, ack.message_id, `❌ Error: ${String(err)}`)
      .catch(() => {})
  }
})

bot.catch((err) => {
  console.error("Telegram bot error:", err)
})

console.log("🤖 Telegram bot starting (long-polling)...")
bot.start()
