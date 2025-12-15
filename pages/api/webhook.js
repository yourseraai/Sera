import { processMessage } from "../../lib/seraBrain";
import { sendTelegram } from "../../lib/seraHelpers";

export default async function handler(req, res) {
  try {
    const message = req.body.message;
    if (!message || !message.text) return res.status(200).end();

    const chatId = message.chat.id;
    const text = message.text;

    const reply = await processMessage(chatId, text);
    await sendTelegram(chatId, reply);

    res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).end();
  }
}
