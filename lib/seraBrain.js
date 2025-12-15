// lib/seraBrain.js
import axios from "axios";
import { getUser, saveUser, extractName } from "./onboarding";
import {
  nowIndiaFull,
  getTimeForCountry,
  convertCurrency,
  systemPrompt
} from "./seraHelpers";

export async function seraBrain({ chatId, text }) {
  let user = getUser(chatId);

  // NEW USER
  if (!user) {
    saveUser(chatId, { state: "ASK_GENDER" });
    return (
      "👋 Hi, main *Sera* hoon — aapki personal operator.\n\n" +
      "Aap kaunsa operator prefer karenge?\n\n" +
      "👨 Male\n👩 Female\n🤖 No preference"
    );
  }

  // GENDER
  if (user.state === "ASK_GENDER") {
    let gender = null;
    if (/male|mard|ladka/i.test(text)) gender = "male";
    if (/female|aurat|ladki/i.test(text)) gender = "female";
    if (/no|any|neutral/i.test(text)) gender = "neutral";

    if (!gender) {
      return "Please choose: 👨 Male / 👩 Female / 🤖 No preference";
    }

    saveUser(chatId, { ...user, gender, state: "ASK_NAME" });
    return "Noted ✅\n\nAapka naam kya hai?";
  }

  // NAME
  if (user.state === "ASK_NAME") {
    const name = extractName(text);
    if (!name) return "Kripya sirf apna naam likhiye.";

    saveUser(chatId, {
      ...user,
      name,
      state: "READY",
      language: "hinglish"
    });

    return `Shukriya ${name}.\n\nAb bataiye, main kya kaam karu?`;
  }

  // READY STATE
  if (/time|samay/i.test(text)) {
    const india = nowIndiaFull();
    const foreign = await getTimeForCountry(text);
    return foreign
      ? `🌍 ${foreign.country}: ${foreign.time}\n🇮🇳 India: ${india.time}`
      : `🇮🇳 India: ${india.time}`;
  }

  if (/\d+/.test(text) && /(usd|inr|rs|dollar)/i.test(text)) {
    const amt = parseFloat(text.match(/\d+/)[0]);
    const converted = await convertCurrency(text, amt);
    if (converted) return converted;
  }

  // GPT FALLBACK
  const completion = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt(user) },
        { role: "user", content: text }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return completion.data.choices[0].message.content;
}
