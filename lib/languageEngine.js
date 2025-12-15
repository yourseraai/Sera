export function resolveLanguage(text = "") {
  if (typeof text !== "string") return "hinglish";

  const hindiWords = ["hai", "mera", "kya", "ka", "batao"];
  const found = hindiWords.some(w => text.toLowerCase().includes(w));

  return found ? "hinglish" : "english";
}

