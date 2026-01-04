module.exports = function detectLanguage(business) {
  // default hinglish
  if (!business || !business.languagePreference) return "hinglish"
  return business.languagePreference
}
