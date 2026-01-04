const users = new Map();

function getUser(userId) {
  return users.get(userId);
}

function createUser(userId) {
  const user = {
    userId,
    onboardingState: "OWNER_IDENTITY",
    ownerName: null
  };
  users.set(userId, user);
  return user;
}

function updateUser(user) {
  users.set(user.userId, user);
}

module.exports = {
  getUser,
  createUser,
  updateUser
};
