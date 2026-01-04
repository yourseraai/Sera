const { getUser, updateUser } = require("../memory/userRepo");
const { getBusiness, updateBusiness } = require("../memory/businessRepo");

function onboardingManager(ctx) {
  const user = ctx.user;
  const business = ctx.business;

  if (user.onboardingState === "OWNER_IDENTITY") {
    if (!user.ownerName) {
      ctx.reply("Aapka naam?");
      return;
    }

    user.onboardingState = "BUSINESS_IDENTITY";
    updateUser(user);
    ctx.reply("Business ka naam?");
    return;
  }

  if (user.onboardingState === "BUSINESS_IDENTITY") {
    if (!business.name) {
      ctx.reply("Business ka naam?");
      return;
    }

    user.onboardingState = "ONBOARDING_COMPLETE";
    updateUser(user);
    ctx.reply("Theek hai. Main ready hoon.");
  }
}

module.exports = onboardingManager;
