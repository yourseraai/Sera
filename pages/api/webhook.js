// pages/api/webhook.js
import axios from "axios";
import { telegramSend, getTimeForCountry, convertCurrency } from "../../lib/seraHelpers";
import { detectIntent } from "../../lib/intent";
import { getUser, saveUser, extractName } from "../../lib/onboarding";

/* ========== MEMORY (DEV – later Supabase replace) ========== */
const notes = new Map(); // chatId -> [{ text, ts }]

/* ========== HELPERS ========== */
function getNotes(chatId) {
  if (!notes.has(chatId)) notes.set(chatId, []);
  return notes.get(chatId);
}

function address(user) {
  if (user.address === "sir") return "Sir";
  if (user.avoidName) return "";
  return user.name || "";
}

function prefix(user) {
  const a = address(user);
  return a ? `${a}, ` : "";
}

/* ========== MAIN HANDLER ========== */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const msg = req.body.message;
  if (!msg || !msg.text) return res.status(200).send("OK");

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const intent = detectIntent(text);
  const user = getUser(chatId);

  /* ========== ONBOARDING (NON-BLOCKING) ========== */
  if (user.state === "NEW_USER" && intent === "GREETING") {
    await telegramSend(
      chatId,
      "Hi 🙂 Main Sera hoon — tumhari personal operator.\nNaam batana chaaho toh bata do, warna kaam bol do. Dono chalega."
    );
    saveUser(chatId, { state: "READY" });
    return res.end("OK");
  }

  if (!user.name && intent === "NAME_INPUT") {
    const name = extractName(text);
    if (name) {
      saveUser(chatId, { name });
      await telegramSend(chatId, `Got it. Yaad rahega 🙂`);
      return res.end("OK");
    }
  }

  /* ========== PREFERENCES ========== */
  if (intent === "SET_ADDRESS_SIR") {
    saveUser(chatId, { address: "sir" });
    await telegramSend(chatId, "Understood. Main aapko Sir bolungi.");
    return res.end("OK");
  }

  if (intent === "AVOID_NAME") {
    saveUser(chatId, { avoidName: true });
    await telegramSend(chatId, "Theek hai. Naam use nahi karungi.");
    return res.end("OK");
  }

  /* ========== TIME ========== */
  if (intent === "TIME_QUERY") {
    if (/india/i.test(text)) {
      const t = await getTimeForCountry("Asia/Kolkata");
      await telegramSend(chatId, `🇮🇳 India: ${t.time} (${t.date})`);
      return res.end("OK");
    }

    const countryMatch = text.match(/japan|usa|uk|canada|australia/i);
    if (countryMatch) {
      const country = countryMatch[0];
      const other = await getTimeForCountry(country);
      const india = await getTimeForCountry("Asia/Kolkata");
      await telegramSend(
        chatId,
        `🌍 ${country.toUpperCase()}: ${other.time} (${other.date})\n🇮🇳 India: ${india.time}`
      );
      return res.end("OK");
    }
  }

  /* ========== CURRENCY ========== */
  if (intent === "CURRENCY_QUERY") {
    const amt = text.match(/\d+/)?.[0];
    if (amt) {
      if (/usd/i.test(text) && /inr|rs/i.test(text)) {
        const r = await convertCurrency(amt, "USD", "INR");
        await telegramSend(chatId, `${amt} USD ≈ ${r.toFixed(2)} INR`);
        return res.end("OK");
      }
      if (/inr|rs/i.test(text)) {
        const r = await convertCurrency(amt, "INR", "USD");
        await telegramSend(chatId, `${amt} INR ≈ ${r.toFixed(2)} USD`);
        return res.end("OK");
      }
    }
  }

  /* ========== NOTES ========== */
  if (intent === "TASK_CREATE") {
    const arr = getNotes(chatId);
    arr.push({ text, ts: Date.now() });
    await telegramSend(chatId, `✅ Saved.`);
    return res.end("OK");
  }

  if (intent === "TASK_QUERY") {
    const arr = getNotes(chatId);
    if (!arr.length) {
      await telegramSend(chatId, "Koi note nahi mila.");
    } else {
      await telegramSend(chatId, `📝 Last note:\n${arr[arr.length - 1].text}`);
    }
    return res.end("OK");
  }

  if (intent === "TASK_DELETE") {
    const arr = getNotes(chatId);
    if (!arr.length) {
      await telegramSend(chatId, "Koi note nahi hai delete karne ke liye.");
    } else {
      const removed = arr.pop();
      await telegramSend(chatId, `🗑️ Deleted:\n${removed.text}`);
    }
    return res.end("OK");
  }

  /* ========== CONTENT (GPT – STRICT OUTPUT) ========== */
  if (intent === "CONTENT_REQUEST" || intent === "IDEAS") {
    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are SERA. Respond in Hinglish. Be precise. No repetition. Follow instructions exactly."
          },
          { role: "user", content: text }
        ],
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    await telegramSend(chatId, completion.data.choices[0].message.content);
    return res.end("OK");
  }

  /* ========== FALLBACK ========== */
  await telegramSend(chatId, `${prefix(user)}bolo kya karna hai.`);
  return res.end("OK");
}
