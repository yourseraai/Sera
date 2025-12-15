// lib/memoryEngine.js

const users = new Map();

export function getUser(chatId) {
  if (!users.has(chatId)) {
    users.set(chatId, {
      state: "NEW",
      name: null,
      gender: null,
      tone: "professional",
      language: "hinglish"
    });
  }
  return users.get(chatId);
}

export function saveUser(chatId, data) {
  const user = getUser(chatId);
  users.set(chatId, { ...user, ...data });
}
