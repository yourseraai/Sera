const store = {}

module.exports = {
  get(id) {
    return store[id]
  },
  save(data) {
    store[data.businessId] = data
  }
}
