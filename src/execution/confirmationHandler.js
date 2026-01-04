const {
  getPendingAction,
  clearPendingAction
} = require("../memory/actionRepo");
const { updateConversation } = require("../memory/conversationRepo");

function confirmationHandler(ctx) {
  const pending = getPendingAction(ctx.user.userId);
  if (!pending) return false;

  const t = ctx.message.toLowerCase();

  if (t === "haan") {
    clearPendingAction(ctx.user.userId);
    updateConversation(ctx.user.userId, { activeAgenda: null });
    ctx.reply("Done. Follow-up save kar liya 🙂");
    return true;
  }

  if (t === "nahi") {
    clearPendingAction(ctx.user.userId);
    updateConversation(ctx.user.userId, { activeAgenda: null });
    ctx.reply("Cancel kar diya.");
    return true;
  }

  ctx.reply("Please haan ya nahi me reply karein.");
  return true;
}

module.exports = confirmationHandler;
