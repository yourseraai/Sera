// lib/intentDetector.js

export function detectIntent(text) {
  if (typeof text !== "string") return "general";

  const t = text.toLowerCase();

  if (t.includes("time") || t.includes("samay")) return "time";
  if (t.includes("usd") || t.includes("inr") || t.includes("rs")) return "currency";
  if (t.includes("yaad") || t.includes("note") || t.includes("remind")) return "note";
  if (t.includes("naam")) return "name";

  return "general";
}
