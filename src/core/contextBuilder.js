const { getUser, createUser } = require("../memory/userRepo");
const { getBusiness, createBusiness } = require("../memory/businessRepo");

async function buildContext(ctx) {
  let user = getUser(ctx.userId);
  if (!user) user = createUser(ctx.userId);

  let business = getBusiness(ctx.userId);
  if (!business) business = createBusiness(ctx.userId);

  ctx.user = user;
  ctx.business = business;
}

module.exports = buildContext;
