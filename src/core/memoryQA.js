function handleMemoryQA(ctx) {
  const t = ctx.message.toLowerCase();

  if (t.includes("mera naam")) {
    ctx.reply(`Aapka naam ${ctx.user.ownerName} hai.`);
    return true;
  }

  if (t.includes("business") && t.includes("naam")) {
    ctx.reply(`Business ka naam ${ctx.business.name} hai.`);
    return true;
  }

  return false;
}

module.exports = handleMemoryQA;
