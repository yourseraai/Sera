// lib/onboarding.js

const users = new Map(); 
// chatId -> { state: "NEW_USER" | "ASK_NAME" | "READY", name, email, timezone }

export function getUser(chatId) {
  if (!users.has(chatId)) {
    users.set(chatId, { state: "NEW_USER", name: null });
  }
  return users.get(chatId);
}

export function saveUser(chatId, data) {
  users.set(chatId, { ...getUser(chatId), ...data });
}

export function extractName(text = "") {
  const m = text.match(/(?:mera naam|my name is)\s+([a-zA-Z]{2,30})/i);
  if (m) return m[1];
  // fallback: single word, no question
  if (!text.includes("?") && text.split(" ").length <= 2) return text;
  return null;
}
