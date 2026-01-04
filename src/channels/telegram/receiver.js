const axios = require("axios")

const detectIntent = require("../../core/intentDetector")
const actionPlanner = require("../../core/actionPlanner")
const contextBuilder = require("../../core/contextBuilder")

const onboardingManager = require("../../onboarding/onboardingManager")
const detectUpdateIntent = require("../../core/updateDetector")
const applyUpdate = require("../../core/updateApplier")

const detectLanguage = require("../../language/detectLanguage")
const render = require("../../language/renderResponse")

const rateLimiter = require("../../safety/rateLimiter")
const dedupe = require("../../safety/dedupe")
const quietHours = require("../../safety/quietHours")

const featureFlags = require("../../config/featureFlags")
const planMatrix = require("../../config/planMatrix")
const permissions = require("../../dashboard/permissions")
const killSwitch = require("../../dashboard/killSwitch")

async function send(chatId, text) {
  if (!text) return
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: chatId, text }
  )
}

module.exports = function (app) {
  console.log("📲 Telegram OPERATOR receiver loaded")

  app.post("/telegram", async (req, res) => {
    try {
      const msg =
        req.body.message ||
        req.body.edited_message ||
        req.body.channel_post

      if (!msg || !msg.chat || !msg.text) {
        return res.send("ok")
      }

      if (killSwitch.isPaused()) return res.send("ok")
      if (!dedupe(msg.message_id)) return res.send("ok")

      const ctx = contextBuilder(msg)
      if (!rateLimiter(ctx.userId)) return res.send("ok")
      if (quietHours()) return res.send("ok")

      /* 🧩 ONBOARDING */
      const onboardingReply = onboardingManager.processMessage(
        ctx.businessId,
        msg.text
      )
      if (onboardingReply) {
        await send(msg.chat.id, onboardingReply)
        return res.send("ok")
      }

      /* ✏️ UPDATE MODE */
      const updateIntent = detectUpdateIntent(msg.text)
      if (updateIntent) {
        const reply = applyUpdate(ctx.businessId, updateIntent, msg.text)
        await send(msg.chat.id, reply)
        return res.send("ok")
      }

      /* 🧠 INTENT */
      const intent = detectIntent(msg.text)
      const lang = detectLanguage(ctx.business)

      if (!featureFlags[intent]) {
        await send(msg.chat.id, render("UNKNOWN", lang))
        return res.send("ok")
      }

      if (!planMatrix[ctx.plan]?.includes(intent)) {
        await send(msg.chat.id, render("PLAN_RESTRICTED", lang))
        return res.send("ok")
      }

      if (!permissions(ctx, intent)) {
        await send(msg.chat.id, render("NO_PERMISSION", lang))
        return res.send("ok")
      }

      const plan = actionPlanner(intent)
      if (!plan.executor) {
        await send(msg.chat.id, render("UNKNOWN", lang))
        return res.send("ok")
      }

      /* ⚙️ EXECUTE + REPLY (SINGLE SOURCE) */
      const reply = await plan.executor({
        ctx,
        text: msg.text,
        send
      })

      await send(msg.chat.id, reply)
      return res.send("ok")
    } catch (err) {
      console.error("🔥 TELEGRAM OPERATOR ERROR:", err)
      return res.send("ok")
    }
  })
}
