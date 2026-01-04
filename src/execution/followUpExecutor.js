const businessRepo = require("../memory/businessRepo")
const userRepo = require("../memory/userRepo")
const { format } = require("date-fns")

function extractContact(text) {
  // phone number
  const phoneMatch = text.match(/\b\d{10}\b/)
  if (phoneMatch) {
    return { type: "phone", value: phoneMatch[0] }
  }

  // telegram username
  const usernameMatch = text.match(/@\w+/)
  if (usernameMatch) {
    return { type: "username", value: usernameMatch[0] }
  }

  return null
}

async function execute({ ctx, text }) {
  const biz = businessRepo.get(ctx.businessId)
  const user = userRepo.get(ctx.userId)

  if (!biz.businessName) {
    return `⚠️ Pehle business setup complete kar lete hain.\nBusiness ka naam confirm kar do.`
  }

  const t = text.toLowerCase()

  // 1️⃣ TARGET
  let target = "client"
  if (t.includes("mujhe") || t.includes("me") || t.includes("mera")) {
    target = "self"
  }

  // 2️⃣ CONTACT
  const contact = extractContact(text)

  if (target === "client" && !contact) {
    return (
      `❓ Confirm kar loon — follow-up kis client ko karna hai?\n` +
      `Aap phone number ya @username likh sakte ho.\n\n— SERA`
    )
  }

  // 3️⃣ TIME (loose)
  let when = "soon"
  if (t.includes("kal")) when = "tomorrow"
  else if (t.includes("aaj")) when = "today"
  else if (t.includes("shaam")) when = "evening"
  else if (t.includes("subah")) when = "morning"
  else if (t.includes("baad")) when = "later"

  // 4️⃣ LOG
  const now = format(new Date(), "dd MMM, hh:mm a")

  biz.lastAction = {
    type: "FOLLOW_UP",
    target,
    contact,
    when,
    text,
    at: Date.now()
  }

  businessRepo.save(ctx.businessId, biz)

  // 5️⃣ HUMAN REPLY
  if (target === "self") {
    return (
      `⏰ Reminder noted.\n` +
      `Main aapko **${when}** yaad dila dunga.\n\n` +
      `🕒 Logged at ${now}\n` +
      `— SERA`
    )
  }

  return (
    `📌 Follow-up noted.\n` +
    `Client **${contact.value}** ko **${when}** follow-up kar dunga.\n\n` +
    `🕒 Logged at ${now}\n` +
    `— SERA`
  )
}

module.exports = { execute }
