// lib/intent.js
// Central intent detection for SERA

export function detectIntent(text = "") {
  const t = text.toLowerCase().trim();

  // ---- GREETING ----
  if (/^(hi|hello|hey|namaste|yo)\b/.test(t)) return "GREETING";

  // ---- NAME INPUT ----
  if (
    !t.includes("?") &&
    !/(sir|bhai|bro|bc|abe|tum|aap)/.test(t) &&
    t.split(" ").length <= 3 &&
    /^[a-zA-Z\s]+$/.test(t)
  ) {
    return "NAME_INPUT";
  }

  // ---- ADDRESS / PREFERENCE ----
  if (/sir bolo|sir se bulao|call me sir/.test(t)) return "SET_ADDRESS_SIR";
  if (/naam mat lo|name mat lo|dont use my name/.test(t)) return "AVOID_NAME";
  if (/tum bolo|tum se baat/.test(t)) return "USE_TUM";
  if (/aap bolo|aap se baat/.test(t)) return "USE_AAP";

  // ---- TONE ----
  if (/professional reh|professional tone/.test(t)) return "TONE_PRO";
  if (/chill reh|chill tone/.test(t)) return "TONE_CHILL";
  if (/witty ban/.test(t)) return "TONE_WITTY";
  if (/emoji kam/.test(t)) return "EMOJI_LOW";

  // ---- TIME ----
  if (/time|samay|kitna baje/.test(t)) return "TIME_QUERY";

  // ---- CURRENCY ----
  if (/\d+.*(inr|rs|usd|dollar|yen|jpy)/.test(t)) return "CURRENCY_QUERY";

  // ---- NOTES / TASKS ----
  if (/call .*tomorrow|meeting|save note|note:|remind/.test(t))
    return "TASK_CREATE";

  if (/last saved note|last note/.test(t)) return "TASK_QUERY";

  if (/delete last note/.test(t)) return "TASK_DELETE";

  // ---- CONTENT ----
  if (/draft|message|email|follow-up/.test(t)) return "CONTENT_REQUEST";

  // ---- IDEAS ----
  if (/growth ideas|ideas|lead gen/.test(t)) return "IDEAS";

  // ---- COMPLAINT / EMOTION ----
  if (/same cheez|bc|wtf|problem/.test(t)) return "FRUSTRATION";

  return "GENERAL";
}
