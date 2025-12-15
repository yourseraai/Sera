export function detectIntent(text) {
  const t = text.toLowerCase();

  if (["male", "female", "no preference"].includes(t)) {
    return { type: "SET_GENDER", value: t };
  }

  if (t.includes("mera naam")) return { type: "ASK_NAME" };

  if (t.startsWith("mera naam")) {
    const parts = t.split(" ");
    return { type: "SET_NAME", value: parts[parts.length - 1] };
  }

  if (t.includes("time")) return { type: "TIME" };
  if (t.includes("note") || t.includes("yaad")) return { type: "NOTE" };

  return { type: "GENERAL" };
}
