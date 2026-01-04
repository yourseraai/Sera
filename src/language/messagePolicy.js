const tones = require("./toneProfiles")
const emojis = require("./emojiRules")

module.exports = function formatMessage({
  text,
  tone = "professional",
  emojiKey = null,
  language = "hinglish"
}) {
  const profile = tones[tone] || tones.professional
  let emoji = ""

  if (emojiKey && emojis[emojiKey]) {
    emoji = emojis[emojiKey] + " "
  }

  let finalText = `${emoji}${profile.prefix}${text}${profile.punctuation}\n${profile.suffix}`

  return finalText
}
