export function detectLanguage(text) {
  const hindiRegex = /[अ-ह]/;
  if (hindiRegex.test(text)) return "hindi";
  return "english";
}

export function enforceHinglish(text, detectedLang) {
  if (detectedLang === "hindi") {
    return text
      .replace("क्या", "kya")
      .replace("बताओ", "batao")
      .replace("समय", "time");
  }
  return text;
}
