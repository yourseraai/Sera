// pages/api/webhook.js
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import {
  nowIndiaFull,
  getTimeForCountry,
  convertCurrency,
  telegramSend,
  systemPrompt
} from "../../lib/seraHelpers";
import { getUser, saveUser, extractName } from "../../lib/onboarding"
import { getTime, convert } from "../../lib/seraBrain";

/* ---------- SUPABASE ---------- */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ---------- MAIN HANDLER ---------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end();

  const msg = req.body.message;
  if (!msg || !msg.text) return res.status(200).end();

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  /* 1️⃣ LOAD USER STATE */
  let user = getUser(chatId);

  /* 2️⃣ ONBOARDING STATE MACHINE */
  if (user.state === "NEW_USER") {
    await telegramSend(chatId,
      "Hi. Main Sera hoon — tumhari personal operator.\n\nTumhara naam kya hai?"
    );
    saveUser(chatId, { state: "ASK_NAME" });
    return res.end();
  }

  if (user.state === "ASK_NAME") {
    const name = extractName(text);

    if (!name || name.length < 2) {
      await telegramSend(chatId, "Sirf apna naam likho.");
      return res.end();
    }

    saveUser(chatId, {
      state: "READY",
      name,
      address: "sir",
      tone: "professional"
    });

    await telegramSend(chatId,
      "Noted. Ab kaam ki baat bolo."
    );
    return res.end();
  }

  /* 3️⃣ READY STATE */
  const name = user.name;
  const address = user.address || "sir";

  /* ---- TIME ---- */
  if (/time|samay/i.test(text)) {
    const india = nowIndiaFull();
    const foreign = await getTimeForCountry(text);

    await telegramSend(
      chatId,
      foreign
        ? `🌍 ${foreign.country}: ${foreign.time}\n🇮🇳 India: ${india.time}`
        : `🇮🇳 India: ${india.time}`
    );
    return res.end();
  }

  /* ---- CURRENCY ---- */
  if (/\d+/.test(text) && /(inr|usd|rs|dollar)/i.test(text)) {
    const amt = parseFloat(text.match(/\d+/)[0]);
    const converted = await convertCurrency(text, amt);
    if (converted) {
      await telegramSend(chatId, converted);
      return res.end();
    }
  }

  /* ---- NOTES ---- */
  if (/call|meeting|remind|note/i.test(text)) {
    await supabase.from("notes").insert({
      chat_id: chatId,
      content: text
    });

    await telegramSend(chatId, "Noted.");
    return res.end();
  }

  /* 4️⃣ GPT FALLBACK */
  const completion = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt({ name, address }) },
        { role: "user", content: text }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  const reply = completion.data.choices[0].message.content;

  /* 5️⃣ SAVE CONVERSATION */
  await supabase.from("conv_log").insert([
    { chat_id: chatId, role: "user", content: text },
    { chat_id: chatId, role: "assistant", content: reply }
  ]);

  await telegramSend(chatId, reply);
  res.end();
}
