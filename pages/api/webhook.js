import { processMessage } from "../../lib/seraBrain";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();

  try {
    const body = req.body;
    const msg = body.message || body.edited_message;

    if (!msg) return res.status(200).end();

    const chatId = msg.chat?.id;
    const text = typeof msg.text === "string" ? msg.text.trim() : "";

    if (!chatId) return res.status(200).end();

    await processMessage({
      chatId: String(chatId),
      text: text || "__empty__",
    });

    return res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).end();
  }
}
