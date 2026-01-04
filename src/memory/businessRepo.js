const businesses = new Map();

function getBusiness(ownerId) {
  return businesses.get(ownerId);
}

function createBusiness(ownerId) {
  const business = {
    ownerId,
    name: null
  };
  businesses.set(ownerId, business);
  return business;
}

function updateBusiness(business) {
  businesses.set(business.ownerId, business);
}

module.exports = {
  getBusiness,
  createBusiness,
  updateBusiness
};
