// pages/api/webhook.js
import axios from "axios";
import {
  nowIndia,
  getTimeForCountry,
  convertCurrency,
  telegramSend,
  systemPrompt,
} from "../../lib/seraHelpers";

import {
  getUserMemory,
  saveUserMemory,
  saveNote,
  getLastNote,
  logConversation,
} from "../../lib/memory";

/* ---------------- MAIN HANDLER ---------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.end("OK");

  const msg = req.body.message;
  if (!msg || !msg.text) return res.end("OK");

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  /* -------- LOAD MEMORY -------- */
  let user = await getUserMemory(chatId);

  /* -------- LOG USER MESSAGE -------- */
  await logConversation(chatId, "user", text);

  /* =====================================================
     🟢 ONBOARDING STATE MACHINE
     ===================================================== */

  // 1️⃣ NEW USER → Ask name ONCE
  if (user.state === "NEW_USER") {
    user.state = "ASK_NAME";
    await saveUserMemory(chatId, user);

    await telegramSend(
      chatId,
      "Hi! Main Sera hoon — tumhara AI operator.\nBas ek baar bata do: tumhara naam kya hai?"
    );
    return res.end("OK");
  }

  // 2️⃣ ASK_NAME → Validate name
  if (user.state === "ASK_NAME") {
    // ❌ Reject reactions / abuse / questions
    if (
      text.includes("?") ||
      text.length > 25 ||
      /abe|bc|lol|ha+|accha/i.test(text)
    ) {
      await telegramSend(
        chatId,
        "Bas apna **naam** likh do 🙂"
      );
      return res.end("OK");
    }

    user.name = text;
    user.state = "READY";
    await saveUserMemory(chatId, user);

    await telegramSend(
      chatId,
      `Perfect. Yaad rahega.\nAb batao — kya kaam hai?`
    );
    return res.end("OK");
  }

  /* =====================================================
     🔵 PREFERENCES (Address / Tone)
     ===================================================== */

  if (/sir bolo|call me sir/i.test(text)) {
    user.addressAs = "Sir";
    await saveUserMemory(chatId, user);
    await telegramSend(chatId, "Understood. Main aapko **Sir** kehkar address karungi.");
    return res.end("OK");
  }

  if (/naam se mat bulao/i.test(text)) {
    user.addressAs = null;
    await saveUserMemory(chatId, user);
    await telegramSend(chatId, "Theek hai. Naam use nahi karungi.");
    return res.end("OK");
  }

  if (/professional reh/i.test(text)) {
    user.tone = "professional";
    await saveUserMemory(chatId, user);
    await telegramSend(chatId, "Professional mode enabled.");
    return res.end("OK");
  }

  /* =====================================================
     ⏰ TIME
     ===================================================== */

  if (/time|samay|kitna baj/i.test(text)) {
    if (/india/i.test(text)) {
      await telegramSend(chatId, `🇮🇳 India: ${nowIndia()}`);
      return res.end("OK");
    }

    const match = text.match(/japan|usa|uk/i);
    if (match) {
      const t = await getTimeForCountry(match[0]);
      if (t.ok) {
        await telegramSend(
          chatId,
          `🌍 ${match[0].toUpperCase()}: ${t.datetime} (${t.date})\n🇮🇳 India: ${nowIndia()}`
        );
      }
      return res.end("OK");
    }
  }

  /* =====================================================
     💱 CURRENCY
     ===================================================== */

  if (/\d+/.test(text) && /(inr|usd|jpy|rs|dollar)/i.test(text)) {
    const amt = Number(text.match(/\d+/)[0]);

    if (/usd/i.test(text) && /inr/i.test(text)) {
      const r = await convertCurrency(amt, "USD", "INR");
      await telegramSend(chatId, `${amt} USD ≈ ${r.result.toFixed(2)} INR`);
      return res.end("OK");
    }

    if (/inr/i.test(text) && /usd/i.test(text)) {
      const r = await convertCurrency(amt, "INR", "USD");
      await telegramSend(chatId, `${amt} INR ≈ ${r.result.toFixed(2)} USD`);
      return res.end("OK");
    }
  }

  /* =====================================================
     📝 NOTES
     ===================================================== */

  if (/call|meeting|note|remind/i.test(text)) {
    await saveNote(chatId, text);
    await telegramSend(chatId, "✅ Saved.");
    return res.end("OK");
  }

  if (/last saved note/i.test(text)) {
    const note = await getLastNote(chatId);
    await telegramSend(chatId, note ? `📝 ${note}` : "Koi note nahi mila.");
    return res.end("OK");
  }

  /* =====================================================
     🤖 GPT FALLBACK
     ===================================================== */

  const reply = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt({ edgy: false }) },
        { role: "user", content: text },
      ],
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    }
  );

  const output = reply.data.choices[0].message.content;
  await logConversation(chatId, "assistant", output);
  await telegramSend(chatId, output);

  res.end("OK");
}
