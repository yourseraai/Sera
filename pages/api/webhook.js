// pages/api/webhook.js
import axios from "axios";
import {
  nowIndiaFull,
  getTimeForCountry,
  convertCurrency,
  telegramSend,
  systemPrompt
} from "../../lib/seraHelpers";

/* --------- IN-MEMORY (DEV) --------- */
const memory = new Map(); // chatId -> { name, email, tone }
const notes = new Map();  // chatId -> []

/* --------- HELPERS --------- */
function getClient(chatId) {
  if (!memory.has(chatId)) memory.set(chatId, {});
  return memory.get(chatId);
}

/* --------- MAIN --------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.end("OK");

  const msg = req.body.message;
  if (!msg || !msg.text) return res.end("OK");

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const client = getClient(chatId);

  /* -------- GREETING & NAME -------- */
  if (!client.name && /^(hi|hello|hey)/i.test(text)) {
    await telegramSend(chatId,
      "Hi! Main Sera hoon. Naam bata do taaki main aapko properly assist kar sakun."
    );
    return res.end("OK");
  }

  if (!client.name && text.length < 30) {
    client.name = text;
    await telegramSend(chatId,
      `Perfect, ${client.name}. Yaad rahega 🙂 Batao, aaj kya karna hai?`
    );
    return res.end("OK");
  }

  /* -------- TIME -------- */
  if (/time/i.test(text)) {
    const india = nowIndiaFull();
    if (/japan|usa|uk/i.test(text)) {
      const country = text.match(/japan|usa|uk/i)[0];
      const t = await getTimeForCountry(country);
      if (t) {
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

  /* -------- CURRENCY -------- */
  if (/rs|inr|usd|dollar/i.test(text)) {
    const amt = text.match(/\d+/)?.[0];
    if (amt) {
      const result = await convertCurrency(amt, "INR", "USD");
      await telegramSend(chatId, `${amt} INR ≈ ${result?.toFixed(2)} USD`);
      return res.end("OK");
    }
  }

  /* -------- NOTES -------- */
  if (/call|meeting|note/i.test(text)) {
    const arr = notes.get(chatId) || [];
    arr.push(text);
    notes.set(chatId, arr);
    await telegramSend(chatId, `✅ Saved: "${text}"`);
    return res.end("OK");
  }

  /* -------- GPT FALLBACK -------- */
  const openai = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt({ name: client.name }) },
        { role: "user", content: text }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  await telegramSend(
    chatId,
    openai.data.choices[0].message.content
  );

  res.end("OK");
}
