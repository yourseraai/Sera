const hits = {}

module.exports = function rateLimiter(userId) {
  hits[userId] = (hits[userId] || 0) + 1
  return hits[userId] <= 30
}
