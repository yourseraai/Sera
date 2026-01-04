module.exports = function groupActions(actions) {
  const today = []
  const tomorrow = []

  const now = new Date()
  const tmr = new Date()
  tmr.setDate(now.getDate() + 1)

  actions.forEach(a => {
    const d = new Date(a.executeAt)
    if (d.toDateString() === now.toDateString()) {
      today.push(a)
    } else if (d.toDateString() === tmr.toDateString()) {
      tomorrow.push(a)
    }
  })

  return { today, tomorrow }
}
