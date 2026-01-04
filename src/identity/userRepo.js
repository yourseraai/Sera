const users = {}

module.exports = {
  get(id) {
    return users[id]
  },
  set(id, data) {
    users[id] = { id, ...data }
  }
}
