const format = require("./messagePolicy")

module.exports = function render(key, lang = "hinglish") {
  const messages = {
    FOLLOW_UP_ACK: {
      hinglish: "Follow-up successfully schedule kar diya",
      english: "Follow-up has been scheduled successfully"
    },

    REMINDER_ACK: {
      hinglish: "Reminder set kar diya gaya hai",
      english: "Reminder has been set"
    },

    UNKNOWN: {
      hinglish: "Samajh nahi aaya. Thoda clearly likhiye",
      english: "I didn’t understand that. Please try again"
    }
  }

  const text = messages[key]?.[lang] || messages.UNKNOWN[lang]

  return format({
    text,
    emojiKey: key,
    language: lang
  })
}
