const queue = []

setInterval(() => {
  const now = Date.now()
  queue.forEach(job => {
    if (!job.done && job.runAt <= now) {
      job.run()
      job.done = true
    }
  })
}, 1000)

module.exports = {
  add(job) {
    queue.push(job)
  }
}
