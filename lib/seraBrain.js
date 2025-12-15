import { getUser, saveUser } from "./memoryEngine";
import { detectIntent } from "./intentDetector";
import { resolveLanguage } from "./languageEngine";
import { resolveTone } from "./toneEngine";
import { getTimeByCountry } from "./timeCurrency";
import { applyRules } from "./rules";

export async function processMessage(chatId, text) {
  const user = getUser(chatId);
  const intent = detectIntent(text);

  // ONBOARDING
  if (user.state === "NEW") {
    saveUser(chatId, { state: "ASK_NAME" });
    return "Namaste 🙏 Main Sera hoon. Aapka naam kya hai?";
  }

  // NAME CAPTURE
  if (user.state === "ASK_NAME") {
    const cleanName = text
      .replace(/naam|mera|hai|hu|main|bc|mc|mkc/gi, "")
      .trim();

    if (cleanName.length < 2) {
      return "Please apna proper naam bataiye.";
    }

    saveUser(chatId, { name: cleanName, state: "READY" });
    return `Shukriya ${cleanName}. Ab bataiye main kya madad kar sakti hoon?`;
  }

  // NAME CORRECTION
  if (intent === "name_correction") {
    const corrected = text
      .replace(/naam|mera|galat|nahi|hai|bc|mc|mkc/gi, "")
      .trim();

    if (corrected.length > 1) {
      saveUser(chatId, { name: corrected });
      return `Theek hai. Aapka naam ${corrected} save kar liya gaya hai.`;
    }
    return "Please sahi naam bataiye.";
  }

  // ASK NAME
  if (intent === "ask_name") {
    return `Aapka naam ${user.name} hai.`;
  }

  // TIME
  if (intent === "time_india")
    return `🇮🇳 India ka time hai: ${getTimeByCountry("india")}`;

  if (intent === "time_usa")
    return `🇺🇸 USA ka time hai: ${getTimeByCountry("usa")}`;

  if (intent === "time_japan")
    return `🇯🇵 Japan ka time hai: ${getTimeByCountry("japan")}`;

  // DEFAULT
  return applyRules("Aap kya kaam karwana chahte hain?", text);
}
