const configs = {}

module.exports = {
  get(businessId) {
    return configs[businessId] || {}
  },

  set(businessId, config) {
    configs[businessId] = {
      ...(configs[businessId] || {}),
      ...config,
      updatedAt: Date.now()
    }
  }
}
