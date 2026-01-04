module.exports = function messageStyle(lang) {
  return {
    prefix: lang === "hinglish" ? "✅ " : "✔️ ",
    suffix: lang === "hinglish" ? " — SERA" : " — SERA"
  }
}
