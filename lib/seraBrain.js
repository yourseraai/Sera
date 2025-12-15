import { detectIntent } from "./intentDetector";
import { getUser, saveUser, addNote } from "./memoryEngine";
import { resolveLanguage } from "./languageEngine";
import { resolveTone } from "./toneEngine";
import { getTimeResponse, getCurrencyResponse } from "./timeCurrency";
import { sendTelegram } from "./seraHelpers";

export async function processMessage({ chatId, text }) {
  const user = await getUser(chatId);

  // ---- PERCEPTION ----
  const language = resolveLanguage(text, user);
  const tone = resolveTone(user);
  const intent = detectIntent(text);

  // ---- ONBOARDING ----
  if (!user.operatorGender) {
    if (/male|female|no preference/i.test(text)) {
      await saveUser(chatId, {
        operatorGender: text.toLowerCase(),
      });
      await sendTelegram(chatId, "Noted ✅\nAapka naam kya hai?");
      return;
    }

    await sendTelegram(
      chatId,
      "👋 Hi, main Sera hoon — aapki personal operator.\n\n" +
        "Operator choose karein:\n" +
        "1️⃣ Male\n2️⃣ Female\n3️⃣ No preference\n\n" +
        "Bas 1 / 2 / 3 likhiye."
    );
    return;
  }

  if (!user.name) {
    if (text.length < 2) {
      await sendTelegram(chatId, "Kripya apna naam bataiye.");
      return;
    }
    await saveUser(chatId, { name: text });
    await sendTelegram(chatId, "Shukriya. Ab bataiye main kya kaam karu?");
    return;
  }

  // ---- INTENT HANDLING ----
  if (intent === "TIME") {
    const reply = getTimeResponse(text);
    await sendTelegram(chatId, reply);
    return;
  }

  if (intent === "CURRENCY") {
    const reply = getCurrencyResponse(text);
    await sendTelegram(chatId, reply);
    return;
  }

  if (intent === "NOTE") {
    await addNote(chatId, text);
    await sendTelegram(chatId, "✅ Note saved.");
    return;
  }

  // ---- FALLBACK ----
  await sendTelegram(
    chatId,
    "Samajh gaya. Bataiye aap kya kaam karwana chahte hain?"
  );
}
