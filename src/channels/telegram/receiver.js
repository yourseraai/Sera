const axios = require("axios");

const onboardingManager = require("../../onboarding/onboardingManager");
const handleMemoryQA = require("../../core/memoryQA");
const intentDetector = require("../../core/intentDetector");
const buildContext = require("../../core/contextBuilder");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
        return axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: body.message.chat.id,
            text
          }
        );
      }
    };

    await buildContext(ctx);

    if (handleMemoryQA(ctx)) return res.sendStatus(200);

    onboardingManager(ctx);
    intentDetector(ctx);

    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram receiver error:", err);
    res.sendStatus(200);
  }
};
