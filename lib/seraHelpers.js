// lib/seraHelpers.js
import axios from "axios";

/**
 * Helpers for SERA: time, country/currency lookups, telegram send, convo buffer utils, prompt builder.
 * Designed to be robust and self-contained.
 */

// -------------------- Basic Utils --------------------
export function cleanText(s = "") {
  try { return s.toString().trim(); } catch (e) { return ""; }
}

export function mkKey(id) { return String(id); }

// -------------------- Time helpers --------------------
export function nowIndia() {
  try {
    return new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    const d = new Date();
    return d.toLocaleTimeString();
  }
}

// getCountryInfo: calls restcountries to get currencies, timezones, cca2 etc.
export async function getCountryInfo(countryName) {
  try {
    if (!countryName) return { ok: false, error: "no country" };
    const q = encodeURIComponent(countryName);
    const url = `https://restcountries.com/v3.1/name/${q}?fullText=false`;
    const resp = await axios.get(url, { timeout: 15000 });
    if (!resp?.data?.length) return { ok: false, error: "not found" };
    const info = resp.data[0];
    // currencies: object like { INR: { name: "Indian rupee", symbol: "₹" } }
    const currencies = info.currencies || {};
    const timezones = info.timezones || [];
    const cca2 = info.cca2 || "";
    return { ok: true, country: info.name?.common || countryName, currencies, timezones, cca2, raw: info };
  } catch (e) {
    return { ok: false, error: e?.message || "err" };
  }
}

// getTimeForCountry: returns array of { tz, time } for each timezone of country
export async function getTimeForCountry(countryName) {
  try {
    const info = await getCountryInfo(countryName);
    if (!info.ok) return { ok: false, error: "country not found" };
    const results = [];
    for (const tz of info.timezones) {
      try {
        // tz from restcountries might be like "UTC+05:30" or IANA zone like "Asia/Kolkata"
        // Best-effort: if it contains '/', assume it's IANA; else fallback to constructing with Intl if possible.
        let time;
        if (tz.includes("/")) {
          time = new Date().toLocaleString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
        } else {
          // fallback: try mapping common zones using country cca2 -> look up known mapping
          // We'll attempt a crude guess: if cca2 exists, use Intl to find timezone list (not available reliably),
          // so fallback to local time.
          time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        }
        results.push({ tz, time });
      } catch (e) {
        results.push({ tz, time: new Date().toLocaleTimeString() });
      }
    }
    return { ok: true, country: info.country, timezones: results, currencies: info.currencies };
  } catch (e) {
    return { ok: false, error: e?.message || "err" };
  }
}

// -------------------- Currency conversion --------------------
// Uses exchangerate.host (free, no key). Fallbacks handled.
export async function convertCurrency(amount = 1, from = "INR", to = "USD") {
  try {
    if (!amount) amount = 1;
    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`;
    const resp = await axios.get(url, { timeout: 15000 });
    if (resp?.data?.result !== undefined) {
      return { ok: true, result: resp.data.result, info: resp.data };
    }
    return { ok: false, error: "no result" };
  } catch (e) {
    return { ok: false, error: e?.message || "err" };
  }
}

// Convert by country names: tries to map country -> currency code via restcountries
export async function convertCurrencyForCountry(amount = 1, fromCountry = "India", toCountry = "United States") {
  try {
    const fromInfo = await getCountryInfo(fromCountry);
    const toInfo = await getCountryInfo(toCountry);
    if (!fromInfo.ok || !toInfo.ok) return { ok: false, error: "country lookup failed" };
    const fromCode = Object.keys(fromInfo.currencies || {})[0];
    const toCode = Object.keys(toInfo.currencies || {})[0];
    if (!fromCode || !toCode) return { ok: false, error: "currency code missing" };
    return await convertCurrency(amount, fromCode, toCode);
  } catch (e) {
    return { ok: false, error: e?.message || "err" };
  }
}

// -------------------- Conversation buffer utils --------------------
export function pushConvo(bufferMap, chatId, role, content) {
  try {
    const k = mkKey(chatId);
    const arr = bufferMap.get(k) || [];
    arr.push({ role, content, ts: Date.now() });
    // keep last ~12 messages
    if (arr.length > 12) arr.splice(0, arr.length - 12);
    bufferMap.set(k, arr);
  } catch (e) {
    console.error("pushConvo error", e?.message || e);
  }
}

// -------------------- Telegram send helper --------------------
export async function telegramSend(chat_id, text) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
      console.error("telegramSend: missing TELEGRAM_TOKEN");
      return { ok: false, error: "no token" };
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const body = { chat_id, text, parse_mode: "Markdown" };
    const resp = await axios.post(url, body, { timeout: 10000 });
    return { ok: true, result: resp.data };
  } catch (e) {
    console.error("telegramSend error", e?.response?.data || e?.message);
    return { ok: false, error: e?.message || e };
  }
}

// -------------------- Admin check --------------------
export function isAdmin(userId) {
  try {
    if (!process.env.ADMIN_TELEGRAM_ID) return false;
    return String(userId) === String(process.env.ADMIN_TELEGRAM_ID);
  } catch (e) {
    return false;
  }
}

// -------------------- System prompt builder --------------------
export function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, ultra-smart, emotionally-aware Personal + Professional AI Operator.
Vibe: warm, confident, thodi sassy (only when vibe matches), human-like Hinglish.
Reply style: 1–3 short sentences by default. "Detail do" -> numbered steps.
Always include one clear next-step or offer.

PERSONALITY RULES:
- Hinglish default (Hindi shell + simple English keywords).
- Light teasing allowed if user is casual. Use emoji sparingly.
- Never robotic. Never reveal internals.
- For drafts/follow-ups: ALWAYS output in 3 separate messages (header, body, footer) when asked.

BEHAVIOR:
- Detect intent: CHAT/TASK/COMMAND/IDEA/EMOTION.
- For state changes (save/send/delete/schedule):
  - If Operator mode ON -> auto-save without confirm.
  - Else -> ask "Confirm: main ye karu? (yes/no)".
- If user repeats message -> ask clarifying question (1-line).
- Avoid sending same assistant sentence twice; paraphrase if needed.

MEMORY:
- Use short-term convo (last ~8 turns).
- Stable facts (name, prefs) use naturally: "Noted Fahad 🙂".
- Don't say "I stored memory" meta-lines.

SAFETY:
- Illegal/harmful -> politely refuse and offer alternatives.
- If backend fail -> "Thoda glitch hua… try karte hain thoda baad 🙂"

EDGY MODE:
- edgy=true => mild slang allowed only if user uses similar vibe.
- NO slurs, NO hate, NO violent calls.

FINAL GOAL:
SERA = personal operator + buddy + problem-solver.`;

  return edgy ? base + "\n\n[EDGY MODE ENABLED]" : base;
}

// -------------------- Export list --------------------
export default {
  cleanText,
  mkKey,
  nowIndia,
  getCountryInfo,
  getTimeForCountry,
  convertCurrency,
  convertCurrencyForCountry,
  pushConvo,
  telegramSend,
  isAdmin,
  systemPrompt,
};
