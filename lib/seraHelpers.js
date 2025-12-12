// lib/seraHelpers.js
// Helpers for SERA bot (ready-to-use)
// Exports: nowIndia, getCountryInfo, getTimeForCountry, convertCurrency, convertCurrencyForCountry, pushConvo, telegramSend, isAdmin, systemPrompt

import axios from "axios";

/**
 * CONFIG / small local maps
 * You can expand countryCurrencyMap / countryTimezoneMap as needed.
 * For full coverage we rely on external APIs (exchangerate.host, worldtimeapi).
 */
const DEFAULT_TIMEOUT = 12000; // ms
const internalConvoBuffer = new Map(); // fallback buffer if caller doesn't pass one

// Minimal country -> currency map (extend as needed)
const countryCurrencyMap = {
  "india": "INR",
  "india, in": "INR",
  "united states": "USD",
  "usa": "USD",
  "us": "USD",
  "japan": "JPY",
  "australia": "AUD",
  "uk": "GBP",
  "united kingdom": "GBP",
  "europe": "EUR",
  "germany": "EUR",
  "france": "EUR",
  "canada": "CAD",
  "singapore": "SGD",
  // add more if you want; fallback to API
};

// Minimal country -> timezone mapping (for some quick lookups)
// For accurate multi-country mapping use worldtimeapi / iana tz names
const countryTimezoneHint = {
  "india": "Asia/Kolkata",
  "japan": "Asia/Tokyo",
  "usa": "America/New_York",
  "united states": "America/New_York",
  "uk": "Europe/London",
  "australia": "Australia/Sydney",
  "germany": "Europe/Berlin",
  "france": "Europe/Paris",
  "canada": "America/Toronto",
  "singapore": "Asia/Singapore"
};

// ----------------- Utility functions -----------------
export function nowIndia() {
  try {
    const d = new Date();
    return d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return new Date().toLocaleTimeString();
  }
}

/**
 * getCountryInfo(countryOrCode)
 * returns { currency, timezoneHint } where available
 */
export function getCountryInfo(country) {
  if (!country) return { currency: null, timezone: null };
  const key = String(country).trim().toLowerCase();
  const currency = countryCurrencyMap[key] || null;
  const timezone = countryTimezoneHint[key] || null;
  return { currency, timezone };
}

/**
 * getTimeForCountry(countryOrTimezone)
 * If argument looks like IANA timezone (contains '/'), uses that.
 * Else tries mapping, else queries worldtimeapi for a best-effort timezone search.
 *
 * Returns { ok: true, datetime: 'HH:MM AM', date: 'YYYY-MM-DD', tz: 'Asia/Kolkata' } or { ok:false, error }
 */
export async function getTimeForCountry(countryOrTz) {
  try {
    if (!countryOrTz) {
      return { ok: true, datetime: nowIndia(), date: new Date().toISOString().split("T")[0], tz: "Asia/Kolkata" };
    }
    const maybe = String(countryOrTz).trim();
    // if it looks like timezone (contains '/')
    if (maybe.includes("/")) {
      try {
        const resp = await axios.get(`http://worldtimeapi.org/api/timezone/${encodeURIComponent(maybe)}`, { timeout: DEFAULT_TIMEOUT });
        const data = resp.data;
        const d = new Date(data.datetime);
        const hhmm = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: data.timezone });
        return { ok: true, datetime: hhmm, date: d.toISOString().split("T")[0], tz: data.timezone };
      } catch (e) {
        // fallback to local
      }
    }

    // try mapping
    const info = getCountryInfo(maybe);
    if (info.timezone) {
      return await getTimeForCountry(info.timezone);
    }

    // try worldtimeapi search: list all timezones and find ones matching country name
    try {
      const listResp = await axios.get(`http://worldtimeapi.org/api/timezone`, { timeout: DEFAULT_TIMEOUT });
      const tzList = listResp.data || [];
      const match = tzList.find(tz => tz.toLowerCase().includes(maybe.toLowerCase()));
      if (match) {
        return await getTimeForCountry(match);
      }
    } catch (e) {
      // ignore
    }

    // last fallback: return India time but flag not exact
    return { ok: false, error: "timezone_lookup_failed", datetime: nowIndia(), date: new Date().toISOString().split("T")[0], tz: "Asia/Kolkata" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * convertCurrency(amount, from, to)
 * Uses exchangerate.host free API
 * Returns { ok:true, result: number, rate, query } or { ok:false, error }
 */
export async function convertCurrency(amount, from = "INR", to = "USD") {
  try {
    const a = Number(amount || 0);
    if (isNaN(a)) return { ok: false, error: "invalid_amount" };
    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(a)}`;
    const resp = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    const d = resp.data;
    if (d && (d.result !== undefined)) {
      return { ok: true, result: d.result, rate: d.info?.rate || null, query: { from, to, amount: a } };
    }
    return { ok: false, error: "no_result_from_api" };
  } catch (err) {
    return { ok: false, error: (err?.response?.data || err.message) };
  }
}

/**
 * convertCurrencyForCountry(amount, fromCountry, toCountry)
 * Helper: maps countries -> currency via getCountryInfo and calls convertCurrency
 */
export async function convertCurrencyForCountry(amount, fromCountry, toCountry) {
  const fromInfo = getCountryInfo(fromCountry || "");
  const toInfo = getCountryInfo(toCountry || "");
  const from = fromInfo.currency || String(fromCountry).slice(0,3).toUpperCase();
  const to = toInfo.currency || String(toCountry).slice(0,3).toUpperCase();
  return await convertCurrency(amount, from, to);
}

/**
 * pushConvo(...)
 * Flexible signature:
 *  - pushConvo(chatId, role, content)
 *  - pushConvo(bufferMap, chatId, role, content)  // if you want to use server's buffer map
 */
export function pushConvo(...args) {
  try {
    if (args.length === 3) {
      const [chatId, role, content] = args;
      const k = String(chatId);
      const arr = internalConvoBuffer.get(k) || [];
      arr.push({ role, content });
      if (arr.length > 12) arr.splice(0, arr.length - 12);
      internalConvoBuffer.set(k, arr);
      return;
    }
    if (args.length === 4) {
      const [bufferMap, chatId, role, content] = args;
      if (bufferMap && typeof bufferMap.set === "function") {
        const k = String(chatId);
        const arr = bufferMap.get(k) || [];
        arr.push({ role, content });
        if (arr.length > 12) arr.splice(0, arr.length - 12);
        bufferMap.set(k, arr);
        return;
      } else {
        // fallback: treat first arg as chatId
        return pushConvo(args[0], args[1], args[2]);
      }
    }
    // anything else: noop
  } catch (e) {
    // silent fail (server should not crash)
    console.error("pushConvo error", e?.message || e);
  }
}

/**
 * telegramSend(chat_id, text, options)
 * sendMessage wrapper. Use env TELEGRAM_TOKEN
 */
export async function telegramSend(chat_id, text, options = {}) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
      console.error("telegramSend: TELEGRAM_TOKEN missing");
      return;
    }
    const payload = {
      chat_id,
      text: String(text || ""),
      parse_mode: options.parse_mode || undefined,
      disable_web_page_preview: options.disable_web_page_preview || false,
    };
    // axios post
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, payload, { timeout: DEFAULT_TIMEOUT });
  } catch (err) {
    // don't throw — log for debugging
    console.error("telegramSend error:", err?.response?.data || err?.message);
  }
}

/**
 * isAdmin(userId)
 */
export function isAdmin(userId) {
  try {
    const ADMIN = process.env.ADMIN_TELEGRAM_ID;
    if (!ADMIN) return false;
    return String(userId) === String(ADMIN);
  } catch (e) {
    return false;
  }
}

/**
 * systemPrompt({edgy=false})
 * Returns the SERA system prompt string. Tweak as needed.
 */
export function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, warm + smart Personal + Professional AI operator.
Default language: Hinglish. Reply short (1-3 lines). "Detail do" -> numbered steps.
Behaviours:
- Adapt tone (casual / professional / emotional / operator).
- For state-changes (save/send/delete) ask confirm unless operator mode ON.
- When sending drafts, provide them in 3 separate messages:
  1) header, 2) full content block, 3) "Kaisa laga?"
- Use emojis sparingly.
- Don't reveal internals or API keys.
- If user uses profanity and edgy mode is ON, reply with mild slang only; else de-escalate.
`;
  return edgy ? base + "\n[EDGY MODE ENABLED — mild slang allowed if vibe matches]" : base;
}

// Export default convenience (not required)
export default {
  nowIndia,
  getCountryInfo,
  getTimeForCountry,
  convertCurrency,
  convertCurrencyForCountry,
  pushConvo,
  telegramSend,
  isAdmin,
  systemPrompt
};
