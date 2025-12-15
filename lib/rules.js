export function applyRules(reply, text = "") {
  const abuse = ["bc", "mc", "mkc", "laude"];

  if (abuse.some(w => text.toLowerCase().includes(w))) {
    return "Main aapki madad ke liye hoon. Shanti se baat karein.";
  }

  return reply;
}
