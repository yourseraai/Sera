// lib/onboarding.js

const users = new Map();
// chatId -> user object

export function getUser(chatId) {
  return users.get(chatId) || null;
}

export function saveUser(chatId, data) {
  users.set(chatId, data);
}

export function extractName(text = "") {
  const clean = text.trim();
  if (clean.length >= 2 && clean.length <= 30 && !clean.includes("?")) {
    return clean.split(" ")[0];
  }
  return null;
}
