// src/channels/telegram/receiver.js

const onboardingManager = require("../../onboarding/onboardingManager");
const handleMemoryQA = require("../../core/memoryQA");
const intentDetector = require("../../core/intentDetector");
const buildContext = require("../../core/contextBuilder");
const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is MISSING");
}

module.exports = async function telegramReceiver(req, res) {
  try {
    const body = req.body;

    if (!body.message || !body.message.text) {
      return res.sendStatus(200);
    }

    const ctx = {
      message: body.message.text,
      chatId: body.message.chat.id,
      userId: body.message.from.id,
      reply: async (text) => {
        if (!BOT_TOKEN) {
          console.error("❌ Cannot reply — BOT TOKEN missing");
          return;
        }

        return axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: body.message.chat.id,
            text,
            parse_mode: "Markdown"
          }
        );
      }
    };

    console.log("📩 Telegram message:", ctx.message);

    await buildContext(ctx);
    if (!ctx.business) ctx.business = {};

    if (handleMemoryQA(ctx)) return res.sendStatus(200);

    onboardingManager(ctx);
    intentDetector(ctx);

    return res.sendStatus(200);
  } catch (err) {
    console.error("🔥 TELEGRAM OPERATOR ERROR:", err);
    return res.sendStatus(200);
  }
};
