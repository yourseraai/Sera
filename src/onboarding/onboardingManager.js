// onboardingManager.js

const { getUser, updateUser } = require("../memory/userRepo");
const { getBusiness, updateBusiness } = require("../memory/businessRepo");

function onboardingManager(ctx) {
  const message = ctx.message.toLowerCase();
  const user = ctx.user;
  const business = ctx.business;

  // 0️⃣ Correction-first (sabse upar)
  if (handleCorrection(ctx)) return;

  // 1️⃣ State-based flow
  switch (user.onboardingState) {
    case "OWNER_IDENTITY":
      handleOwnerIdentity(ctx);
      break;

    case "BUSINESS_IDENTITY":
      handleBusinessIdentity(ctx);
      break;

    case "ONBOARDING_COMPLETE":
      // Phase-1 me kuch nahi karna
      break;

    default:
      user.onboardingState = "OWNER_IDENTITY";
      updateUser(user);
      ctx.reply("Aapka naam?");
  }
}

/* =========================
   CORRECTION HANDLER
========================= */

function handleCorrection(ctx) {
  const msg = ctx.message.toLowerCase();
  const user = ctx.user;
  const business = ctx.business;

  const isCorrection =
    msg.includes("galat") ||
    msg.includes("nahi") ||
    msg.includes("wrong");

  if (!isCorrection) return false;

  // Name correction
  const nameMatch = ctx.message.match(/naam\s+(.+)/i);
  if (nameMatch) {
    user.ownerName = cleanValue(nameMatch[1]);
    updateUser(user);
    ctx.reply(`Samjha. Main aapka naam **${user.ownerName}** save kar raha hoon.`);
    return true;
  }

  // Business correction
  const bizMatch = ctx.message.match(/business\s+(.+)/i);
  if (bizMatch) {
    business.name = cleanValue(bizMatch[1]);
    updateBusiness(business);
    ctx.reply("Theek hai. Business name update kar diya.");
    return true;
  }

  return false;
}

/* =========================
   OWNER IDENTITY
========================= */

function handleOwnerIdentity(ctx) {
  const user = ctx.user;

  if (!user.ownerName) {
    ctx.reply("Aapka naam?");
    return;
  }

  // Naam mil gaya → next state
  user.onboardingState = "BUSINESS_IDENTITY";
  updateUser(user);
  ctx.reply("Business ka naam?");
}

/* =========================
   BUSINESS IDENTITY
========================= */

function handleBusinessIdentity(ctx) {
  const business = ctx.business;
  const user = ctx.user;

  if (!business.name) {
    ctx.reply("Business ka naam?");
    return;
  }

  // Business mil gaya → onboarding complete
  user.onboardingState = "ONBOARDING_COMPLETE";
  updateUser(user);

  ctx.reply("Theek hai. Main ready hoon.");
}

/* =========================
   UTILS
========================= */

function cleanValue(val) {
  return val.replace(/[^a-zA-Z0-9\s]/g, "").trim();
}

module.exports = onboardingManager;
