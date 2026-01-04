let enabled = false

module.exports = {
  enable() { enabled = true },
  disable() { enabled = false },
  isEnabled() { return enabled }
}
