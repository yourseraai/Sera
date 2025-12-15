// lib/rules.js

export function applyRules(reply) {
  if (!reply) return "";

  // stop robotic repeats
  return reply.replace(/Please choose:/gi, "").trim();
}
