module.exports = function parseTime(text) {
  const now = new Date()

  const t = text.toLowerCase()

  if (t.includes("kal") || t.includes("tomorrow")) {
    now.setDate(now.getDate() + 1)
  }

  const match = t.match(/(\d{1,2})\s?(am|pm|baje)?/)
  if (match) {
    let hour = parseInt(match[1])
    if (match[2] === "pm" && hour < 12) hour += 12
    now.setHours(hour, 0, 0, 0)
  } else {
    now.setHours(now.getHours() + 1)
  }

  return now.getTime()
}
