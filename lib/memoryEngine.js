const memoryStore = {};

export function getUserMemory(chatId) {
  if (!memoryStore[chatId]) {
    memoryStore[chatId] = {
      name: null,
      notes: [],
      prefs: { address: "aap" }
    };
  }
  return memoryStore[chatId];
}

export function saveName(chatId, name) {
  getUserMemory(chatId).name = name;
}

export function saveNote(chatId, note) {
  getUserMemory(chatId).notes.push({
    note,
    time: new Date().toISOString()
  });
}
