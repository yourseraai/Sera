// lib/intent.js

export function detectIntent(text = "") {
  const t = text.toLowerCase().trim();

  // ----- NAME -----
  if (/mera naam kya hai|my name\?/i.test(t)) return { type: "GET_NAME" };
  if (/mera naam|my name is/i.test(t)) return { type: "SET_NAME" };

  // ----- NOTES -----
  if (/last saved note|pichla note|last note/i.test(t))
    return { type: "GET_LAST_NOTE" };

  if (/delete last note|delete note|note delete/i.test(t))
    return { type: "DELETE_NOTE" };

  if (/^(save note|note save|yaad rakh|remember)/i.test(t))
    return { type: "SAVE_NOTE" };

  // ----- TIME -----
  if (/time|samay|kitna baj/i.test(t))
    return { type: "TIME_QUERY" };

  // ----- CURRENCY -----
  if (/\b(inr|usd|eur|jpy|rs|₹|\$)\b/i.test(t) && /convert|kitna/i.test(t))
    return { type: "CURRENCY_QUERY" };

  // ----- DRAFT / MESSAGE -----
  if (/draft|message|email|whatsapp/i.test(t))
    return { type: "DRAFT_REQUEST" };

  if (/follow[- ]?up/i.test(t))
    return { type: "FOLLOWUP_REQUEST" };

  // ----- DEFAULT -----
  return { type: "SMALL_TALK" };
}
