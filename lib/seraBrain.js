// lib/seraBrain.js

import { resolveLanguage } from "./languageEngine";
import { resolveTone } from "./toneEngine";
import { detectIntent } from "./intentDetector";
import { getUser, saveUser } from "./memoryEngine";
import { getIndiaTime } from "./timeCurrency";
import { applyRules } from "./rules";

export async function processMessage(chatId, text) {
  const user = getUser(chatId);

  const language = resolveLanguage(text);
  const tone = resolveTone(text, user);
  const intent = detectIntent(text);

  saveUser(chatId, { language, tone });

  if (user.state === "NEW") {
    saveUser(chatId, { state: "ASK_NAME" });
    return "Namaste 🙏 Main Sera hoon. Aapka naam kya hai?";
  }

  if (user.state === "ASK_NAME") {
    saveUser(chatId, { name: text, state: "READY" });
    return `Shukriya ${text}. Ab bataiye main kya madad kar sakti hoon?`;
  }

  if (intent === "time") {
    return `🇮🇳 India ka time hai: ${getIndiaTime()}`;
  }

  if (intent === "name") {
    return user.name
      ? `Aapka naam ${user.name} hai.`
      : "Aapne abhi naam nahi bataya.";
  }

  return applyRules("Aap kya kaam karwana chahte hain?");
}
