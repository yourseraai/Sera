// pages/api/webhook.js
// Next.js API route for Telegram webhook
import fetch from "node-fetch";

const DEDUPE_TTL_MS = 60 * 1000; // 60s

if (!global.__recentTelegramUpdates) {
  // store recent update_ids to avoid duplicates (in-memory)
  global.__recentTelegramUpdates = new Map();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) {
    console.error("TELEGRAM_TOKEN missing");
    return res.status(500).json({ ok: false, error: "TELEGRAM_TOKEN not set" });
  }

  const body = req.body;
  const updateId = body?.update_id;

  // quick dedupe
  if (updateId && global.__recentTelegramUpdates.has(updateId)) {
    // already saw this update recently — ignore
    return res.status(200).json({ ok: true, info: "duplicate_ignored" });
  }
  if (updateId) {
    global.__recentTelegramUpdates.set(updateId, Date.now());
    // clean up after TTL
    setTimeout(() => global.__recentTelegramUpdates.delete(updateId), DEDUPE_TTL_MS);
  }

  try {
    // find message payload
    const message = body.message || body.edited_message || body.callback_query?.message;
    if (!message) {
      return res.status(200).json({ ok: true, info: "no_message_payload" });
    }

    const chatId = message.chat.id;
    const text = (message.text || message.caption || "").toString();

    // --- Simple reply logic (customize as needed) ---
    let replyText = "Haan bolo — Sera sun rahi hai 🙂";

    // example: respond differently to greetings
    if (/^\s*(hi|hello|hey|hey mera name|kya haal)/i.test(text)) {
      replyText = "Main theek hoon — bata kya chahiye?";
    }

    // send single message
    const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: "HTML"
      })
    });

    const tgJson = await tgResp.json();

    // return 200 with telegram response for debugging
    return res.status(200).json({ ok: true, telegram: tgJson });
  } catch (err) {
    console.error("webhook error:", err);
    // still return 200 so Telegram doesn't retry repeatedly
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
