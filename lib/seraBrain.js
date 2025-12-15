import { getUser, updateUser, addNote } from "./memoryEngine";
import { detectIntent } from "./intentDetector";
import { getTimeResponse } from "./timeCurrency";

export async function seraBrain(chatId, text) {
  const user = getUser(chatId);
  const intent = detectIntent(text);

  // 🟢 ONBOARDING
  if (user.state === "NEW") {
    updateUser(chatId, { state: "ASK_GENDER" });
    return "👋 Hi, main Sera hoon.\nAap kaunsa operator prefer karenge?\n1️⃣ Male\n2️⃣ Female\n3️⃣ No preference";
  }

  if (user.state === "ASK_GENDER" && intent.type === "SET_GENDER") {
    updateUser(chatId, { gender: intent.value, state: "ASK_NAME" });
    return "Noted ✅\nAapka naam kya hai?";
  }

  if (user.state === "ASK_NAME" && intent.type === "SET_NAME") {
    updateUser(chatId, { name: intent.value, state: "READY" });
    return `Shukriya ${intent.value}. Ab bataiye main kya madad karu?`;
  }

  // 🟢 READY STATE
  if (intent.type === "ASK_NAME") {
    return user.name
      ? `Aapka naam ${user.name} hai.`
      : "Abhi tak aapka naam save nahi hua hai.";
  }

  if (intent.type === "TIME") {
    return getTimeResponse(text);
  }

  if (intent.type === "NOTE") {
    addNote(chatId, text);
    return "Noted ✅ Main yaad rakhungi.";
  }

  // 🟡 SMART FALLBACK
  return "Samajh gaya. Aap clearly bataiye main kya karu — time, note, ya koi task?";
}
