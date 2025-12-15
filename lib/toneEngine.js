// lib/toneEngine.js

function safeText(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object" && input.text) return String(input.text);
  return String(input);
}

export function resolveTone(text, user = {}) {
  const t = safeText(text).toLowerCase();

  // Explicit commands
  if (t.includes("professional") || t.includes("formal")) {
    return "professional";
  }

  if (t.includes("chill") || t.includes("casual") || t.includes("friendly")) {
    return "casual";
  }

  // Abuse → force professional
  if (/(bc|mc|wtf|laude|chutiya)/i.test(t)) {
    return "professional";
  }

  // User preference
  if (user.tone) return user.tone;

  // Default
  return "professional";
}

export function resolveAddress(text, user = {}) {
  const t = safeText(text).toLowerCase();

  if (t.includes("sir") || t.includes("aap")) return "aap";
  if (t.includes("tum") || t.includes("tu")) return "tum";

  return user.address || "aap";
}
