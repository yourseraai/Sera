function classifyMessage(text) {
  const t = text.toLowerCase().trim();

  if (["haan", "nahi"].includes(t)) return "CONFIRMATION";
  if (["ok", "acha", "hmm", "theek"].includes(t)) return "NO_OP";
  if (t.includes("naam") || t.includes("business")) return "QUESTION";
  if (t.includes("follow up") || t.includes("reminder")) return "COMMAND";

  return "CHAT";
}

module.exports = classifyMessage;
