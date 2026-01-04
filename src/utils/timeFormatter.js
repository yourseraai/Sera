module.exports = function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
}