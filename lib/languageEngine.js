// lib/languageEngine.js

export function resolveLanguage(text) {
  if (typeof text !== "string") return "hinglish";

  const t = text.toLowerCase();

  if (/[अ-ह]/.test(t)) return "hinglish"; // Hindi → Hinglish
  if (t.includes("english")) return "english";
  if (t.includes("hindi")) return "hinglish";

  return "hinglish"; // default India-safe
}
