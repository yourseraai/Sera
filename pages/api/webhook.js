import { processMessage } from "../../lib/seraBrain";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();

  try {
    const body = req.body;

    const msg =
      body.message ||
      body.edited_message ||
      body.channel_post ||
      null;

    if (!msg) return res.status(200).end();

    const chatId = msg.chat?.id;
    const text =
      typeof msg.text === "string"
        ? msg.text.trim()
        : "";

    if (!chatId) return res.status(200).end();

    // 🔥 VERY IMPORTANT: DO NOT DROP SHORT / WEIRD TEXT
    const safeText = text.length ? text : "__empty__";

    await processMessage({
      chatId: String(chatId),
      text: safeText,
    });

    return res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).end();
  }
}
