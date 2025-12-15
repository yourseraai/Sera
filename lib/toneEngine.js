// lib/toneEngine.js

export function resolveTone(text, user = {}) {
  if (typeof text !== "string") return user.tone || "professional";

  const t = text.toLowerCase();

  if (t.includes("aap")) return "professional";
  if (t.includes("tum") || t.includes("tu")) return "casual";

  return user.tone || "professional";
}
