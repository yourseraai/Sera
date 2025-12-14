// lib/seraHelpers.js
import axios from "axios";

/* ---------------- BASIC TIME ---------------- */
export function nowIndiaFull() {
  const d = new Date();
  return {
    time: d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }),
    date: d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  };
}

/* ---------------- COUNTRY TIME ---------------- */
export async function getTimeForCountry(country) {
  try {
    const res = await axios.get(
      `https://worldtimeapi.org/api/timezone`
    );

    const tz = res.data.find(t =>
      t.toLowerCase().includes(country.toLowerCase())
    );

    if (!tz) throw new Error("TZ_NOT_FOUND");

    const data = await axios.get(
      `https://worldtimeapi.org/api/timezone/${tz}`
    );

    const d = new Date(data.data.datetime);

    return {
      country,
      time: d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: tz
      }),
      date: d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: tz
      }),
      tz
    };
  } catch {
    return null;
  }
}

/* ---------------- CURRENCY ---------------- */
export async function convertCurrency(amount, from, to) {
  const res = await axios.get(
    `https://api.exchangerate.host/convert`,
    { params: { amount, from, to } }
  );
  return res.data?.result || null;
}

/* ---------------- TELEGRAM ---------------- */
export async function telegramSend(chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
    { chat_id: chatId, text }
  );
}

/* ---------------- ADMIN ---------------- */
export function isAdmin(id) {
  return String(id) === String(process.env.ADMIN_TELEGRAM_ID);
}

/* ---------------- SYSTEM PROMPT ---------------- */
export function systemPrompt({ name }) {
  return `
You are SERA — a human-like personal AI operator.

Rules:
- Language: Hinglish
- Client name: ${name || "Client"}
- Never forget client name once saved
- Ask info only when needed
- Drafts/messages MUST be returned in 3 separate messages
- Never reveal you talk to others
- Be adaptive: chill / professional / witty / flirty-light
`;
}
