const businesses = {}

module.exports = {
  get(id) {
    return businesses[id]
  },
  set(id, data) {
    businesses[id] = { id, ...data }
  }
}
