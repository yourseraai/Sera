export function formatTone(text, prefs) {
  let response = text;

  if (prefs?.address === "aap") {
    response = response
      .replace(/\btum\b/gi, "aap")
      .replace(/\btu\b/gi, "aap");
  }

  return response;
}
