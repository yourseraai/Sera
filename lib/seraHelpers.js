// lib/seraHelpers.js
import axios from "axios";

/**
 * SERA Helpers (upgraded)
 * - nowIndia()
 * - getCountryInfo(countryName) -> {ok, name, cca2, currencies: {code: {name, symbol}}, timezones: [...]}
 * - getTimeForCountry(countryName) -> returns formatted local time(s) for that country (uses restcountries + worldtimeapi)
 * - convertCurrency(amount, from, to) -> exchangerate.host
 * - convertCurrencyForCountry(amount, fromCountry, toCountry) -> autodetect currencies from country names
 * - pushConvo(bufferMap, chatId, role, content)
 * - isAdmin(userId)
 * - telegramSend(chat_id, text)
 * - cleanText
 * - systemPrompt
 *
 * Caching: simple in-memory caches to reduce API calls (valid for runtime; restart clears cache).
 */

// ------- In-memory caches (process-lifetime) -------
const countryInfoCache = new Map(); // key: lowercase country name -> countryInfo
const timezoneCache = new Map(); // key: timezone string -> human-readable time
const currencyRateCache = new Map(); // key: from_to -> {rate, ts}

// ------- Utilities -------
function nowIndia() {
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

export { nowIndia };

// Clean text
export function cleanText(s = "") {
  return (s || "").toString().trim();
}

// ------- Country info (restcountries) -------
// Returns detailed country info (timezones, currencies, cca2, official name)
export async function getCountryInfo(countryName) {
  if (!countryName) return { ok: false, error: "missing_country" };
  const key = cleanText(countryName).toLowerCase();
  if (countryInfoCache.has(key)) return { ok: true, ...countryInfoCache.get(key) };

  try {
    // Use restcountries API
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=false`;
    const resp = await axios.get(url, { timeout: 10000 });
    if (!resp?.data || !Array.isArray(resp.data) || resp.data.length === 0) {
      return { ok: false, error: "not_found" };
    }

    // Choose best match (first)
    const c = resp.data[0];
    const info = {
      name: c.name?.common || c.name?.official || countryName,
      cca2: c.cca2 || null,
      timezones: Array.isArray(c.timezones) ? c.timezones : [],
      currencies: c.currencies || {}, // object: { USD: { name, symbol }, INR: {...} }
      region: c.region || null,
      subregion: c.subregion || null,
    };

    countryInfoCache.set(key, info);
    return { ok: true, ...info };
  } catch (e) {
    // try fuzzy single-word fallback (maybe user passed "usa" or "uk")
    try {
      const short = key.split(/\s|,|-/)[0];
      if (short && short !== key) {
        const retry = await getCountryInfo(short);
        if (retry.ok) return retry;
      }
    } catch (_) {}
    return { ok: false, error: String(e?.message || e) };
  }
}

// ------- Time for country -------
// Returns readable times for the country's timezones (date + time). Uses worldtimeapi where possible.
// If restcountries gives timezones (like "UTC+05:30" or "Europe/London") we try to use worldtimeapi for zone names,
// otherwise we compute approximate local time using Intl with timezone (if valid).
export async function getTimeForCountry(countryName) {
  const ci = await getCountryInfo(countryName);
  if (!ci.ok) return { ok: false, error: ci.error || "country_not_found" };

  const tzs = ci.timezones && ci.timezones.length ? ci.timezones : [];
  const results = [];

  for (let tz of tzs) {
    // normalize timezone strings: restcountries sometimes gives "UTC+05:30" — worldtimeapi needs zone names
    // If tz contains "/" assume it's an IANA zone (e.g., "Asia/Tokyo")
    if (timezoneCache.has(tz)) {
      results.push({ tz, time: timezoneCache.get(tz) });
      continue;
    }

    let humanTime = null;

    try {
      if (tz.includes("/")) {
        // Try worldtimeapi for accurate time & date
        const z = tz;
        try {
          const r = await axios.get(`http://worldtimeapi.org/api/timezone/${encodeURIComponent(z)}`, { timeout: 8000 });
          if (r?.data?.datetime) {
            const dt = new Date(r.data.datetime);
            humanTime = `${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })} (${dt.toLocaleDateString()})`;
          }
        } catch (_) {
          // fallback to Intl
          try {
            const dt = new Date().toLocaleString("en-US", { timeZone: z });
            const parsed = new Date(dt);
            humanTime = `${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })} (${parsed.toLocaleDateString()})`;
          } catch (_) {
            humanTime = null;
          }
        }
      } else if (/UTC|GMT/i.test(tz)) {
        // tz like "UTC+05:30" — compute offset
        const m = tz.match(/([+-]\d{1,2}):?(\d{2})?/);
        if (m) {
          // simple offset compute using current UTC time
          const sign = m[1].startsWith("-") ? -1 : 1;
          const hours = Math.abs(parseInt(m[1], 10));
          const mins = m[2] ? parseInt(m[2], 10) : 0;
          const offsetMinutes = sign * (hours * 60 + mins);
          const now = new Date();
          const utc = now.getTime() + now.getTimezoneOffset() * 60000;
          const local = new Date(utc + offsetMinutes * 60 * 1000);
          humanTime = `${local.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })} (${local.toLocaleDateString()})`;
        }
      } else {
        // fallback: try treating as IANA zone
        try {
          const dt = new Date().toLocaleString("en-US", { timeZone: tz });
          const parsed = new Date(dt);
          humanTime = `${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })} (${parsed.toLocaleDateString()})`;
        } catch (_) {
          humanTime = null;
        }
      }
    } catch (e) {
      humanTime = null;
    }

    if (!humanTime) {
      // final fallback: nowIndia (not ideal)
      humanTime = nowIndia();
    }

    timezoneCache.set(tz, humanTime);
    results.push({ tz, time: humanTime });
  }

  return { ok: true, country: ci.name, timezones: results, cca2: ci.cca2, region: ci.region };
}

// ------- Currency conversion (exchangerate.host) -------
export async function convertCurrency(amount = 1, from = "INR", to = "USD") {
  try {
    const key = `${from}_${to}`;
    // cache short-term (60s)
    const cached = currencyRateCache.get(key);
    const nowTs = Date.now();
    if (cached && nowTs - cached.ts < 60 * 1000 && cached.rate != null) {
      return { ok: true, result: (Number(amount) * cached.rate), rate: cached.rate, cached: true };
    }

    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`;
    const r = await axios.get(url, { timeout: 10000 });
    if (r?.data?.result != null) {
      // cache the rate
      const rate = r.data?.info?.rate ?? (r.data.result / (amount || 1));
      currencyRateCache.set(key, { rate, ts: nowTs });
      return { ok: true, result: r.data.result, rate, raw: r.data };
    }
  } catch (e) {
    // continue to fallback
  }
  return { ok: false, error: "conversion_failed" };
}

// Convert currency by country names - auto-detect currencies using restcountries
export async function convertCurrencyForCountry(amount = 1, fromCountry, toCountry) {
  if (!fromCountry || !toCountry) return { ok: false, error: "missing_country" };
  const fromInfo = await getCountryInfo(fromCountry);
  const toInfo = await getCountryInfo(toCountry);
  if (!fromInfo.ok || !toInfo.ok) return { ok: false, error: "country_lookup_failed" };

  // pick first currency code from each
  const fromCodes = Object.keys(fromInfo.currencies || {});
  const toCodes = Object.keys(toInfo.currencies || {});
  if (fromCodes.length === 0 || toCodes.length === 0) return { ok: false, error: "currency_not_found" };

  const fromCode = fromCodes[0];
  const toCode = toCodes[0];
  return await convertCurrency(amount, fromCode, toCode);
}

// ------- Conversation helpers (in-memory) -------
export function pushConvo(bufferMap, chatId, role, content) {
  const k = String(chatId);
  const arr = bufferMap.get(k) || [];
  arr.push({ role, content, ts: Date.now() });
  if (arr.length > 12) arr.splice(0, arr.length - 12);
  bufferMap.set(k, arr);
}

// ------- Telegram send with retry -------
export async function telegramSend(chat_id, text, options = {}) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) {
    console.error("telegramSend: TELEGRAM_TOKEN missing");
    return false;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = { chat_id, text, parse_mode: "HTML", ...options };

  for (let i = 0; i < 3; i++) {
    try {
      await axios.post(url, payload, { timeout: 8000 });
      return true;
    } catch (e) {
      console.error("telegramSend error attempt", i + 1, e?.response?.data || e?.message);
      // exponential backoff
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  return false;
}

// ------- Admin test -------
export function isAdmin(userId) {
  const ADMIN = process.env.ADMIN_TELEGRAM_ID;
  return Boolean(ADMIN && String(userId) === String(ADMIN));
}

// ------- System prompt builder -------
export function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, ultra-smart, emotionally-aware Personal + Professional AI Operator.
Default language: Hinglish. Reply short (1-3 lines) unless user asks "detail do".
Rules: follow 3-part format for drafts/follow-ups; ask for missing details; operator-mode auto-save; edgy toggles allowed if enabled.
When asked for times/currency for a country, use country-aware answers: timezone(s) + local time + date; currency conversion uses live rates.
Be helpful, deterministic for state changes, and never reveal internals.
`;
  return edgy ? base + "\n[EDGY MODE ON]" : base;
}

// ------- Export default helpers bundle (optional) -------
export default {
  nowIndia,
  getCountryInfo,
  getTimeForCountry,
  convertCurrency,
  convertCurrencyForCountry,
  pushConvo,
  telegramSend,
  isAdmin,
  cleanText,
  systemPrompt,
};
