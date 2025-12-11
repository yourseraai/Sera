// pages/api/webhook.js
import axios from "axios";

// TEMP in-memory dedupe set. For prod use Redis/Upstash.
const seen = new Set();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const update = req.body;

    // 1) Basic sanity
    if (!update) {
      console.log("empty update");
      return res.status(200).send("ok");
    }

    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) {
        console.log("duplicate update ignored:", updateId);
        return res.status(200).send("ok");
      }
      // mark seen for short time (memory cleanup below)
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 5 * 60 * 1000); // 5 min
    }

    // 2) Get message and chat
    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg) {
      console.log("no message in update:", JSON.stringify(update).slice(0,300));
      return res.status(200).send("ok");
    }

    // ignore messages from bots (prevent self-loop)
    if (msg.from?.is_bot) {
      console.log("ignored bot message from:", msg.from?.id);
      return res.status(200).send("ok");
    }

    const chatId = msg.chat?.id;
    const text = (msg.text || msg.caption || update.callback_query?.data || "").toString().trim();
    if (!chatId || !text) {
      console.log("no chatId or text", chatId, text);
      return res.status(200).send("ok");
    }

    // 3) OPENAI KEY check (don't spam users if missing)
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY missing in env");
      // optional: send one admin message instead of spamming users; here we just ack
      return res.status(200).send("ok");
    }

    // 4) Call OpenAI safely
    let reply = "Kuch gadbad huyi, thoda baad try karo.";
    try {
      const aiRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Tum Sera ho — short, warm, Hinglish replies." },
            { role: "user", content: text }
          ],
          max_tokens: 250,
        },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
      );

      reply = aiRes?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (err) {
      console.error("OpenAI error:", err?.response?.data || err.message);
      // leave reply as fallback
    }

    // 5) Send reply to Telegram (one send)
    try {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: reply,
      });
    } catch (err) {
      console.error("Telegram send error:", err?.response?.data || err.message);
      // still return ok so Telegram doesn't retry
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("handler error:", e);
    // always return 200 to prevent Telegram retry storms
    return res.status(200).send("ok");
  }
}
