const memoryStore = {};

export function getUser(chatId) {
  if (!memoryStore[chatId]) {
    memoryStore[chatId] = {
      state: "NEW",
      name: null,
      gender: null,
      tone: "professional",
      notes: []
    };
  }
  return memoryStore[chatId];
}

export function updateUser(chatId, updates = {}) {
  const user = getUser(chatId);
  memoryStore[chatId] = { ...user, ...updates };
  return memoryStore[chatId];
}

export function addNote(chatId, note) {
  const user = getUser(chatId);
  user.notes.push({
    text: note,
    time: new Date().toISOString()
  });
}
