// pages/api/webhook.js
import axios from "axios";
import {
  nowIndiaFull,
  getTimeForCountry,
  convertCurrency,
  telegramSend,
  systemPrompt
} from "../../lib/seraHelpers";

import {
  getUser,
  saveUser,
  extractName
} from "../../lib/onboarding";

/* -------------------- DEV STORES -------------------- */
const notes = new Map(); // chatId -> [{ text, ts }]

/* -------------------- MAIN HANDLER -------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.end("OK");

  try {
    const msg = req.body.message;
    if (!msg || !msg.text) return res.end("OK");

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    /* ---------- USER STATE ---------- */
    const user = getUser(chatId);

    /* ==================================================
       🧠 ONBOARDING STATE MACHINE
       ================================================== */

    // 1️⃣ NEW USER
    if (user.state === "NEW_USER") {
      await telegramSend(
        chatId,
        "Hey! Main Sera hoon 🙂 Tumhara naam kya hai?"
      );
      saveUser(chatId, { state: "ASK_NAME" });
      return res.end("OK");
    }

    // 2️⃣ ASK_NAME
    if (user.state === "ASK_NAME") {
      const name = extractName(text);

      if (!name) {
        await telegramSend(chatId, "Bas apna naam likh do 😊");
        return res.end("OK");
      }

      saveUser(chatId, { state: "READY", name });

      await telegramSend(
        chatId,
        `Perfect, ${name}. Yaad rahega 🙂 Batao, aaj kya karna hai?`
      );
      return res.end("OK");
    }

    /* ==================================================
       ✅ READY STATE (NORMAL OPERATIONS)
       ================================================== */

    const clientName = user.name || "boss";

    /* ---------- TIME QUERIES ---------- */
    if (/time|samay|kitna baj/i.test(text)) {
      const india = nowIndiaFull();

      if (/japan|usa|uk|india/i.test(text)) {
        const country = text.match(/japan|usa|uk|india/i)[0];
        const t = await getTimeForCountry(country);

        if (t?.ok) {
          await telegramSend(
            chatId,
            `🌍 ${country.toUpperCase()}: ${t.time} (${t.date})\n🇮🇳 India: ${india.time}`
          );
          return res.end("OK");
        }
      }

      await telegramSend(chatId, `🇮🇳 India: ${india.time}`);
      return res.end("OK");
    }

    /* ---------- CURRENCY CONVERSION ---------- */
    if (/\b\d+\b/.test(text) && /(inr|rs|usd|dollar|jpy|yen)/i.test(text)) {
      const amt = Number(text.match(/\d+/)?.[0]);
      let from = "INR";
      let to = "USD";

      if (/usd|dollar/i.test(text)) from = "USD";
      if (/jpy|yen/i.test(text)) from = "JPY";
      if (/inr|rs/i.test(text)) to = "INR";

      const r = await convertCurrency(amt, from, to);
      if (r?.ok) {
        await telegramSend(
          chatId,
          `${amt} ${from} ≈ ${r.result.toFixed(2)} ${to}`
        );
        return res.end("OK");
      }
    }

    /* ---------- NOTES ---------- */
    if (/call|meeting|note|remind/i.test(text)) {
      const arr = notes.get(chatId) || [];
      arr.push({ text, ts: Date.now() });
      notes.set(chatId, arr);

      await telegramSend(chatId, `✅ Saved: "${text}"`);
      return res.end("OK");
    }

    if (/last saved note/i.test(text)) {
      const arr = notes.get(chatId) || [];
      if (!arr.length) {
        await telegramSend(chatId, "Abhi koi note saved nahi hai.");
        return res.end("OK");
      }
      await telegramSend(chatId, `📝 Last note: "${arr[arr.length - 1].text}"`);
      return res.end("OK");
    }

    /* ==================================================
       🤖 GPT FALLBACK (CHAT / DRAFTS / IDEAS)
       ================================================== */

    const openai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt({ name: clientName })
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.4,
        max_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const reply = openai.data.choices[0].message.content;

    await telegramSend(chatId, reply);
    return res.end("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    return res.end("OK");
  }
}
