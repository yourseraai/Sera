// lib/toneEngine.js

export function resolveTone(text, user = {}) {
  const t = text.toLowerCase();

  // Explicit user instruction
  if (/professional|formal/i.test(t)) return "professional";
  if (/chill|casual|friendly/i.test(t)) return "casual";

  // Abuse / aggression → force professional
  if (/bc|mc|wtf|laude|chutiya/i.test(t)) {
    return "professional";
  }

  // Respect preference
  if (user.tone) return user.tone;

  // Default
  return "professional";
}

export function resolveAddress(text, user = {}) {
  const t = text.toLowerCase();

  if (/sir|aap/i.test(t)) return "aap";
  if (/tum|tu/i.test(t)) return "tum";

  return user.address || "aap";
}
