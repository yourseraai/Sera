const businessRepo = require("../memory/businessRepo")

module.exports = function applyUpdate(businessId, updateType, text) {
  const business = businessRepo.get(businessId)
  if (!business) return "⚠️ Business profile not found — SERA"

  switch (updateType) {
    case "UPDATE_BUSINESS_NAME":
      business.businessName = text
      break

    case "UPDATE_BUSINESS_TYPE":
      business.businessType = text
      break

    case "UPDATE_WORKING_HOURS":
      business.workingHours = text
      break

    case "UPDATE_FOLLOW_UP_RULE":
      business.followUpRule = text
      break

    case "UPDATE_OWNER_NAME":
      business.ownerName = text
      break

    case "UPDATE_LANGUAGE":
      if (text.toLowerCase().includes("english")) {
        business.languagePreference = "english"
      } else if (text.toLowerCase().includes("hindi")) {
        business.languagePreference = "hindi"
      } else {
        business.languagePreference = "hinglish"
      }
      break
  }

  businessRepo.save(business)

  return "✅ Details updated successfully — SERA"
}
