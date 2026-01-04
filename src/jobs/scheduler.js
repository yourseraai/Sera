const queue = require("./jobQueue")

module.exports = {
  schedule(executor, payload) {
    queue.push({ executor, payload })
  }
}
