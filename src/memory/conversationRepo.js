const conversations = new Map();

function getConversation(userId) {
  return conversations.get(userId) || {
    activeAgenda: null,
    waitingFor: null
  };
}

function updateConversation(userId, data) {
  conversations.set(userId, {
    ...getConversation(userId),
    ...data
  });
}

function clearConversation(userId) {
  conversations.delete(userId);
}

module.exports = {
  getConversation,
  updateConversation,
  clearConversation
};
