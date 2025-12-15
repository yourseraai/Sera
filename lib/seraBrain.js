import { RULES } from "./rules";
import { detectLanguage, enforceHinglish } from "./languageEngine";
import { formatTone } from "./toneEngine";
import { detectIntent } from "./intentDetector";
import { getUserMemory, saveName, saveNote } from "./memoryEngine";
import { getTime, convertCurrency } from "./timeCurrency";

export function processMessage(chatId, text) {
  const memory = getUserMemory(chatId);

  const lang = detectLanguage(text);
  const cleanText = enforceHinglish(text, lang);
  const intent = detectIntent(cleanText);

  let reply = "";

  if (intent === "name") {
    const name = cleanText.split(" ").pop();
    saveName(chatId, name);
    reply = `Shukriya ${name}. Ab bataiye main kya madad karu?`;
  }

  else if (intent === "note") {
    saveNote(chatId, cleanText);
    reply = "Note save kar liya gaya hai.";
  }

  else if (intent === "time") {
    if (cleanText.includes("japan")) reply = `Japan ka time: ${getTime("japan")}`;
    else if (cleanText.includes("india")) reply = `India ka time: ${getTime("india")}`;
    else if (cleanText.includes("usa")) reply = `USA ka time: ${getTime("usa")}`;
    else reply = "Kaunsa country ka time chahiye?";
  }

  else if (intent === "currency") {
    const amount = parseInt(cleanText);
    if (cleanText.includes("usd") && cleanText.includes("inr")) {
      reply = `${amount} USD ≈ ₹${convertCurrency(amount, "usd", "inr")}`;
    } else {
      reply = "Currency clearly batayiye.";
    }
  }

  else {
    reply = "Aap kya kaam karwana chahte hain?";
  }

  reply = formatTone(reply, memory.prefs);

  RULES.forbiddenPhrases.forEach(p => {
    reply = reply.replace(p, "");
  });

  return reply;
}
