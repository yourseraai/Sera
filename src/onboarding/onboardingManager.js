const { updateUser } = require("../memory/userRepo");
const { updateBusiness } = require("../memory/businessRepo");
const { updateConversation } = require("../memory/conversationRepo");

function onboardingManager(ctx) {
  const { user, business, message } = ctx;
  const text = message.trim();

  updateConversation(user.userId, {
    activeAgenda: "ONBOARDING"
  });

  if (!user.onboardingState) {
    user.onboardingState = "ASK_OWNER_NAME";
    updateUser(user);
    ctx.reply("Aapka naam?");
    return;
  }

  if (user.onboardingState === "ASK_OWNER_NAME") {
    if (text.length < 2) {
      ctx.reply("Naam thoda clear bataiye 🙂");
      return;
    }

    user.ownerName = text;
    user.onboardingState = "ASK_BUSINESS_NAME";
    updateUser(user);
    ctx.reply("Business ka naam kya hai?");
    return;
  }

  if (user.onboardingState === "ASK_BUSINESS_NAME") {
    business.name = text;
    updateBusiness(business);

    user.onboardingState = "ONBOARDING_DONE";
    updateUser(user);

    updateConversation(user.userId, {
      activeAgenda: null
    });

    ctx.reply(
      `Perfect ${user.ownerName}. SERA ready hai.\nAb follow-ups aur reminders bol sakte ho.`
    );
  }
}

module.exports = onboardingManager;
