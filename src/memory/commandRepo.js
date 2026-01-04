const history = {}

module.exports = {
  save(businessId, text, intent) {
    if (!history[businessId]) history[businessId] = []

    history[businessId].push({
      text,
      intent,
      timestamp: Date.now()
    })
  },

  getAll(businessId) {
    return history[businessId] || []
  }
}
