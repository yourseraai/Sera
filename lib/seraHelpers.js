// lib/seraHelpers.js
import axios from "axios";

export async function telegramSend(chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: "Markdown"
    }
  );
}

export function nowIndiaFull() {
  const time = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return { time };
}

export async function getTimeForCountry(text) {
  const map = {
    japan: "Asia/Tokyo",
    usa: "America/New_York",
    russia: "Europe/Moscow"
  };

  for (let key in map) {
    if (text.toLowerCase().includes(key)) {
      const time = new Date().toLocaleString("en-US", {
        timeZone: map[key],
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
      return { country: key.toUpperCase(), time };
    }
  }
  return null;
}

export async function convertCurrency(text, amount) {
  if (/usd.*inr|inr.*usd/i.test(text)) {
    const rate = 83;
    return text.toLowerCase().includes("usd")
      ? `${amount} USD ≈ ₹${amount * rate}`
      : `₹${amount} ≈ ${amount / rate} USD`;
  }
  return null;
}

export function systemPrompt(user) {
  return `
You are SERA, a professional AI operator.
Tone: calm, human, professional.
Gender: ${user.gender}
Language: Hinglish default.
Never repeat.
Never argue.
Never flirt.
Always assist.
`;
}
