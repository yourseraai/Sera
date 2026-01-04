const normalizeIntent = require("./intentNormalizer")

module.exports = function detectIntent(text) {
  const t = text.toLowerCase()

  if (normalizeIntent(text) === "SCHEDULE_ACTION") {
    return "SCHEDULE_ACTION"
  }

  if (t.includes("show pending") || t.includes("pending")) {
    return "SHOW_PENDING"
  }

  if (t.startsWith("done") || t.includes("mark done")) {
    return "MARK_DONE"
  }

  if (t.includes("reschedule")) {
    return "RESCHEDULE"
  }

  return "UNKNOWN"
}
