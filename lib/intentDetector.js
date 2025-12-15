export function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("time") || t.includes("samay")) return "time";
  if (t.includes("usd") || t.includes("inr") || t.includes("dollar")) return "currency";
  if (t.includes("yaad") || t.includes("note") || t.includes("remind")) return "note";
  if (t.includes("naam")) return "name";

  return "general";
}
