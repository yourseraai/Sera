const { savePendingAction } = require("../memory/actionRepo");
const { updateConversation } = require("../memory/conversationRepo");

function followUpExecutor(ctx) {
  savePendingAction(ctx.user.userId, {
    type: "FOLLOW_UP",
    text: ctx.message
  });

  updateConversation(ctx.user.userId, {
    activeAgenda: "CONFIRMATION"
  });

  ctx.reply(
    `Ye follow-up add karna hai?\n"${ctx.message}"\nReply karein: haan / nahi`
  );

  return true;
}

module.exports = followUpExecutor;
