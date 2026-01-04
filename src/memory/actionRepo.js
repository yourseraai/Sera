const actions = {}

module.exports = {
  add(businessId, action) {
    if (!actions[businessId]) actions[businessId] = []
    actions[businessId].push(action)
  },

  getPending(businessId) {
    return (actions[businessId] || []).filter(a => a.status === "PENDING")
  },

  markDone(businessId, keyword) {
    const list = actions[businessId] || []
    const action = list.find(
      a => a.status === "PENDING" && a.text.toLowerCase().includes(keyword)
    )
    if (action) action.status = "DONE"
    return action
  },

  reschedule(businessId, keyword, newTime) {
    const list = actions[businessId] || []
    const action = list.find(
      a => a.status === "PENDING" && a.text.toLowerCase().includes(keyword)
    )
    if (action) {
      action.executeAt = newTime
    }
    return action
  }
}
