// lib/onboarding.js

// In-memory onboarding state (later Supabase replaceable)
const userState = new Map(); // chatId -> { state, name }

export function getUserState(chatId) {
  return userState.get(String(chatId)) || { state: "NEW_USER", name: null };
}

export function setUserState(chatId, data) {
  userState.set(String(chatId), data);
}

export function isAskingName(text = "") {
  return /mera naam|my name is/i.test(text);
}

export function extractName(text = "") {
  const match = text.match(/(?:mera naam|my name is)\s+([a-zA-Z]{2,30})/i);
  if (!match) return null;
  return match[1].trim();
}
