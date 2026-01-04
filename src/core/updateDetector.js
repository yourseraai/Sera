module.exports = function detectUpdateIntent(text) {
  const t = text.toLowerCase()

  if (t.includes("business name") || t.includes("mera business")) {
    return "UPDATE_BUSINESS_NAME"
  }

  if (t.includes("business type")) {
    return "UPDATE_BUSINESS_TYPE"
  }

  if (t.includes("working hours") || t.includes("timing")) {
    return "UPDATE_WORKING_HOURS"
  }

  if (t.includes("follow up rule")) {
    return "UPDATE_FOLLOW_UP_RULE"
  }

  if (t.includes("mera naam")) {
    return "UPDATE_OWNER_NAME"
  }

  if (t.includes("language")) {
    return "UPDATE_LANGUAGE"
  }

  return null
}
