const roleResolver = require("../identity/roleResolver")

module.exports = function contextBuilder(msg) {
  return {
    userId: msg.from.id,
    businessId: msg.chat.id,
    role: roleResolver(msg.from.id),
    plan: process.env.DEFAULT_PLAN || "free",
    timestamp: Date.now()
  }
}
