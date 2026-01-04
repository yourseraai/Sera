const businessRepo = require("../memory/businessRepo")
const commandRepo = require("../memory/commandRepo")

const STEPS = {
  SALUTATION: "SALUTATION",
  OWNER_NAME: "OWNER_NAME",
  BUSINESS_NAME: "BUSINESS_NAME",
  BUSINESS_TYPE: "BUSINESS_TYPE",
  WORKING_HOURS: "WORKING_HOURS",
  FOLLOW_UP_RULE: "FOLLOW_UP_RULE",
  COMPLETED: "COMPLETED"
}

function getPrompt(step) {
  switch (step) {
    case STEPS.SALUTATION:
      return `Welcome 👋  
SERA ko setup karne ke liye 2 minute lagenge.

Aap choose karein:
1️⃣ Mr  
2️⃣ Ms`

    case STEPS.OWNER_NAME:
      return "Aapka full naam batayein"

    case STEPS.BUSINESS_NAME:
      return "Business ka naam kya hai?"

    case STEPS.BUSINESS_TYPE:
      return `Business type choose karein:
1️⃣ Service
2️⃣ Product
3️⃣ Local Shop
4️⃣ Online`

    case STEPS.WORKING_HOURS:
      return "Working hours batayein (Example: 10am–7pm)"

    case STEPS.FOLLOW_UP_RULE:
      return `Default follow-up rule choose karein:
1️⃣ 1 day baad
2️⃣ 2 days baad
3️⃣ Manual`

    default:
      return null
  }
}

function applyResponse(business, text) {
  switch (business.onboarding.step) {
    case STEPS.SALUTATION:
      business.ownerSalutation = text.includes("1") ? "Mr" : "Ms"
      business.ownerGender =
        business.ownerSalutation === "Mr" ? "male" : "female"
      business.onboarding.step = STEPS.OWNER_NAME
      break

    case STEPS.OWNER_NAME:
      business.ownerName = text
      business.onboarding.step = STEPS.BUSINESS_NAME
      break

    case STEPS.BUSINESS_NAME:
      business.businessName = text
      business.onboarding.step = STEPS.BUSINESS_TYPE
      break

    case STEPS.BUSINESS_TYPE:
      business.businessType = text
      business.onboarding.step = STEPS.WORKING_HOURS
      break

    case STEPS.WORKING_HOURS:
      business.workingHours = text
      business.onboarding.step = STEPS.FOLLOW_UP_RULE
      break

    case STEPS.FOLLOW_UP_RULE:
      business.followUpRule = text
      business.createdAt = Date.now()
      business.onboarding.completed = true
      business.onboarding.step = STEPS.COMPLETED
      break
  }

  businessRepo.save(business)
}

function startOnboarding(businessId) {
  const business = {
    businessId,
    onboarding: {
      completed: false,
      step: STEPS.SALUTATION
    }
  }

  businessRepo.save(business)
  return getPrompt(STEPS.SALUTATION)
}

function processMessage(businessId, text, intent = null) {
  commandRepo.save(businessId, text, intent)

  const business = businessRepo.get(businessId)

  if (!business) {
    return startOnboarding(businessId)
  }

  if (business.onboarding.completed) {
    return null
  }

  applyResponse(business, text)

  if (business.onboarding.completed) {
    return `✅ Setup complete, ${business.ownerSalutation} ${business.ownerName}

Ab aap SERA ko commands de sakte hain:
• new lead
• follow up
• reminder
• show pending

— SERA`
  }

  return getPrompt(business.onboarding.step)
}

module.exports = {
  processMessage,
  STEPS
}
