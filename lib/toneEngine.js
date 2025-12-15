export function resolveTone(text = "") {
  if (typeof text !== "string") return "aap";

  const rude = ["tu", "tera", "teri"];
  const isRude = rude.some(w => text.toLowerCase().includes(w));

  return isRude ? "aap" : "aap";
}
