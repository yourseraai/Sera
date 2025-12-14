const users = new Map();

export function getUser(chatId) {
  if (!users.has(chatId)) {
    users.set(chatId, {
      state: "NEW",
      name: null,
      addressAs: null,
      avoidName: false,
      tone: "professional",
      emojiLevel: "normal",
      language: "hinglish",
      lastIntent: null,
      lastReplyHash: null
    });
  }
  return users.get(chatId);
}

export function updateUser(chatId, patch) {
  const u = getUser(chatId);
  users.set(chatId, { ...u, ...patch });
}

export function resetUser(chatId) {
  users.delete(chatId);
}
