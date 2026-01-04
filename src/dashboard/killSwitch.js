let paused = false

module.exports = {
  isPaused() {
    return paused
  },
  pause() {
    paused = true
  },
  resume() {
    paused = false
  }
}
