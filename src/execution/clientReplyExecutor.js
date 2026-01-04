const templates = require("../language/clientMessageTemplates")
const tones = require("../language/clientToneProfiles")
const businessRepo = require("../memory/businessRepo")
const quietHours = require("../safety/quietHours")

module.exports = function clientReplyExecutor({
  ctx,
  leadName,
  sendToClient
}) {
  const business = businessRepo.get(ctx.businessId)
  const lang = business.languagePreference || "hinglish"
  const tone = tones.polite

  let templateKey = "FIRST_MESSAGE"

  if (quietHours()) {
    templateKey = "AFTER_HOURS"
  }

  let text = templates[templateKey][lang]
  text = text.replace("{name}", leadName || "there")

  const finalMessage =
    `${tone.greeting} ${leadName || ""},\n\n` +
    `${text}\n\n${tone.closing}` +
    (tone.emoji ? ` ${tone.emoji}` : "")

  sendToClient(finalMessage)
}
