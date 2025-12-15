// pages/api/webhook.js
import { seraBrain } from "../../lib/seraBrain";
import { telegramSend } from "../../lib/seraHelpers";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();

  const msg = req.body.message;
  if (!msg || !msg.text) return res.status(200).end();

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  try {
    const reply = await seraBrain({ chatId, text });
    await telegramSend(chatId, reply);
  } catch (err) {
    console.error(err);
    await telegramSend(chatId, "⚠️ System issue. Try again later.");
  }

  res.status(200).end();
}
