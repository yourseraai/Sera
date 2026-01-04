module.exports = function ruleEngine(intent, ctx) {
  if (ctx.role === "staff" && intent === "BROADCAST") {
    return { allow: false, reason: "Permission denied" }
  }
  return { allow: true }
}
