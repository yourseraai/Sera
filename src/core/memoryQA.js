// memoryQA.js

function handleMemoryQA(ctx) {
  const msg = ctx.message.toLowerCase();
  const user = ctx.user;
  const business = ctx.business;

  // Owner name
  if (
    msg.includes("mera naam") ||
    msg.includes("my name")
  ) {
    if (user.ownerName) {
      ctx.reply(`Aapka naam **${user.ownerName}** hai.`);
    } else {
      ctx.reply("Ye abhi save nahi hai.");
    }
    return true;
  }

  // Business name
  if (
    msg.includes("mera business") ||
    msg.includes("business name")
  ) {
    if (business.name) {
      ctx.reply(`Aapka business **${business.name}** hai.`);
    } else {
      ctx.reply("Ye abhi save nahi hai.");
    }
    return true;
  }

  // Last follow-up
  if (
    msg.includes("last follow up") ||
    msg.includes("pichla follow") ||
    msg.includes("last reminder")
  ) {
    if (user.lastFollowUp) {
      ctx.reply(
        `Last follow-up **${user.lastFollowUp.target}** ke liye tha, ${user.lastFollowUp.time}.`
      );
    } else {
      ctx.reply("Abhi tak koi follow-up nahi hai.");
    }
    return true;
  }

  return false;
}

module.exports = handleMemoryQA;
