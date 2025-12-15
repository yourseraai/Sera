// lib/seraBrain.js

import { detectIntent } from "./intent";
import { getMemory, saveMemory } from "./memory";
import { getUser, saveUser } from "./onboarding";

export function seraBrain(chatId, text) {
  const user = getUser(chatId);
  const memory = getMemory(chatId);
  const intent = detectIntent(text);

  // ---------- 1. FIRST CONTACT ----------
  if (!user.gender) {
    return {
      reply: `👋 Hi, main **Sera** hoon — aapki personal operator.\n\n👉 Aap kaun sa operator gender prefer karna chahenge?\n\n🧑‍💼 Male\n👩‍💼 Female\n\n(Bas ek likhiye)`,
      stop: true
    };
  }

  // ---------- 2. NAME HANDLING ----------
  if (!user.name && intent === "NAME_PROVIDED") {
    saveUser(chatId, { name: text.trim() });
    return {
      reply: `✅ Noted, ${text.trim()}.\n\nAb bataiye — main aapki kaise madad kar sakti hoon?`
    };
  }

  // ---------- 3. LANGUAGE SWITCH ----------
  if (intent === "LANGUAGE_CHANGE") {
    saveUser(chatId, { language: text });
    return {
      reply: `🌐 Samajh gaya.\n\nAgar aap chahen toh hum **${text}** me bhi baat kar sakte hain.\nFilhaal kaam bataiye.`
    };
  }

  // ---------- 4. TIME / CURRENCY ----------
  if (intent === "TIME_QUERY") {
    return {
      reply: `⏰ Exact country ka naam likhiye.\nExample: *Japan time*`
    };
  }

  if (intent === "CURRENCY_QUERY") {
    return {
      reply: `💱 Conversion bata dunga.\nFormat likhiye:\n👉 *50 USD in INR*`
    };
  }

  // ---------- 5. REMINDERS ----------
  if (intent === "REMINDER") {
    saveMemory(chatId, { lastNote: text });
    return {
      reply: `📝 Reminder noted.\nAgar time clear karna ho toh bataiye.`
    };
  }

  // ---------- 6. FALLBACK (SMART, NON-REPEATING) ----------
  return {
    reply: `Samajh raha hoon. Aap ka kaam bataiye — main execute karunga.`
  };
}
