const buildContext = require("../../core/contextBuilder");
const classifyMessage = require("../../core/messageClassifier");
const onboardingManager = require("../../onboarding/onboardingManager");
const handleMemoryQA = require("../../core/memoryQA");
const followUpExecutor = require("../../execution/followUpExecutor");
const confirmationHandler = require("../../execution/confirmationHandler");
const { getConversation } = require("../../memory/conversationRepo");

async function telegramReceiver(req, res) {
  try {
    const msg = req.body.message;
    if (!msg || !msg.text) return res.sendStatus(200);

    const ctx = {
      userId: msg.from.id,
      message: msg.text,
      reply: (t) => sendTelegramMessage(msg.chat.id, t)
    };

    await buildContext(ctx);

    const convo = getConversation(ctx.user.userId);
    const intent = classifyMessage(ctx.message);

    // 🔒 AGENDA LOCK
    if (convo.activeAgenda === "CONFIRMATION") {
      confirmationHandler(ctx);
      return res.sendStatus(200);
    }

    if (ctx.user.onboardingState !== "ONBOARDING_DONE") {
      onboardingManager(ctx);
      return res.sendStatus(200);
    }

    if (intent === "NO_OP") {
      return res.sendStatus(200);
    }

    if (intent === "QUESTION" && handleMemoryQA(ctx)) {
      return res.sendStatus(200);
    }

    if (intent === "COMMAND" && followUpExecutor(ctx)) {
      return res.sendStatus(200);
    }

    ctx.reply("Samajh nahi aaya. Follow-up ya reminder bol sakte ho 🙂");
    res.sendStatus(200);
  } catch (e) {
    console.error("Telegram error:", e);
    res.sendStatus(200);
  }
}

module.exports = telegramReceiver;
