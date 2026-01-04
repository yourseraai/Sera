module.exports = function normalizeIntent(text) {
  const t = text.toLowerCase()

  const actionWords = [
    "follow up", "followup", "follw", "fllw", "folo",
    "remind", "reminder", "yaad dila", "yaad dilana",
    "msg kar", "message bhej", "bol dena", "isko bol",
    "isko bata", "isko yaad", "isko msg"
  ]

  for (const w of actionWords) {
    if (t.includes(w)) return "SCHEDULE_ACTION"
  }

  return null
}
