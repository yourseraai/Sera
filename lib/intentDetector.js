export function detectIntent(text = "") {
  const t = text.toLowerCase();

  if (t.includes("naam") && (t.includes("mera") || t.includes("galat") || t.includes("nahi")))
    return "name_correction";

  if (t.includes("naam kya"))
    return "ask_name";

  if (t.includes("india") && t.includes("time"))
    return "time_india";

  if (t.includes("usa"))
    return "time_usa";

  if (t.includes("japan"))
    return "time_japan";

  return "general";
}
