// pages/api/webhook.js

import { telegramSend } from "../../lib/seraHelpers";
import { processMessage } from "../../lib/seraBrain";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(200).end();

    const msg = req.body.message;
    if (!msg || !msg.text) return res.status(200).end();

    const chatId = String(msg.chat.id);
    const text = msg.text;

    const reply = await processMessage(chatId, text);
    await telegramSend(chatId, reply);

    res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).end();
  }
}
