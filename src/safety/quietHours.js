module.exports = function quietHours() {
  const h = new Date().getHours()
  return h >= 22 || h <= 7
}
