import { processMessage } from "../../lib/seraBrain";
import { sendTelegram } from "../../lib/seraHelpers";

export default async function handler(req, res) {
  try {
    const msg = req.body.message;
    const chatId = msg.chat.id;
    const text = msg.text;

    const reply = processMessage(chatId, text);
    await sendTelegram(chatId, reply);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: true });
  }
}
