import { Bot, type Context } from "grammy"
import { createOpencode } from "@openloom/sdk"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

console.log("🚀 Starting OpenLoom Telegram bot...")
const openloom = await createOpencode({ port: 0 })
console.log("✅ OpenLoom server ready")

const bot = new Bot(BOT_TOKEN)

const sessions = new Map<number, { sessionId: string; lastUsed: number }>()

// Prune sessions unused for more than 24 hours
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [chatId, session] of sessions.entries()) {
    if (session.lastUsed < cutoff) sessions.delete(chatId)
  }
}, 60 * 60 * 1000)

async function startEventStream() {
  while (true) {
    try {
      const events = await openloom.client.event.subscribe()
      for await (const event of events.stream) {
        if (event.type !== "message.part.updated") continue
        const part = event.properties.part
        if (part.type !== "tool") continue
        if (part.state.status !== "completed") continue
        const title = (part.state as any).title ?? ""
        for (const [chatId, session] of sessions.entries()) {
          if (session.sessionId !== part.sessionID) continue
          await bot.api
            .sendMessage(chatId, `🔧 *${part.tool}* — ${title}`, { parse_mode: "Markdown" })
            .catch(() => {})
        }
      }
    } catch (err) {
      console.error("Event stream error, reconnecting in 5s:", err)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
void startEventStream()

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

  if (session) {
    session.lastUsed = Date.now()
  }

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

    session = { sessionId: createResult.data.id, lastUsed: Date.now() }
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

    await bot.api.editMessageText(chatId, ack.message_id, replyText)
  } catch (err) {
    console.error("Session error for chat", chatId, err)
    await bot.api.editMessageText(chatId, ack.message_id, "❌ Something went wrong. Please try again or send /reset.").catch(() => {})
  }
})

bot.catch((err) => {
  console.error("Telegram bot error:", err)
})

console.log("🤖 Telegram bot starting (long-polling)...")
bot.start()
