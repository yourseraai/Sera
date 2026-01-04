module.exports = function canExecute(ctx, intent) {
  if (ctx.role === "owner") return true
  return intent !== "BROADCAST"
}
