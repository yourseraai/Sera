const seen = new Set()
module.exports = id => {
  if (seen.has(id)) return false
  seen.add(id)
  return true
}
