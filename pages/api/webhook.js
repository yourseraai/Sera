// pages/api/webhook.js
// SERA v9.1 — FINAL (paste-ready)
// Adds: model fallback, conv_log supabase insert, stronger guards

import axios from "axios";

/* ---------- In-memory stores (dev only) ---------- */
const seen = new Set();
const pendingAction = new Map();
const notesStore = new Map();
const lastUser = new Map();
const lastAssistant = new Map();
const convoBuffer = new Map();
const rateMap = new Map();
const personaPrefs = new Map();

/* ---------- Configs ---------- */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 10;

/* ---------- Helpers ---------- */
function nowIndia() {
  try {
    return new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return new Date().toLocaleTimeString();
  }
}

function normalize(s = "") {
  return s.toString().toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function toks(s = "") { return normalize(s).split(" ").filter(Boolean); }
function jaccard(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni === 0 ? 0 : inter / uni;
}

/* ---------- Convo helpers ---------- */
function pushConvo(chatId, role, content) {
  try {
    const k = String(chatId); const arr = convoBuffer.get(k) || [];
    arr.push({ role, content, ts: Date.now() });
    if (arr.length > 14) arr.splice(0, arr.length - 14);
    convoBuffer.set(k, arr);
  } catch (e) { console.error("pushConvo error:", e?.message || e); }
}

function saveNoteForChat(chatId, text) {
  try {
    const k = String(chatId);
    const arr = notesStore.get(k) || [];
    arr.push({ text, ts: Date.now() });
    notesStore.set(k, arr);
    // async sync
    supabaseUpsertMemory(k, { key: `note_${Date.now()}`, value: text }).catch(e => console.error("supabase note sync failed:", e?.message || e));
    return true;
  } catch (e) { console.error("saveNoteForChat error:", e?.message || e); return false; }
}

/* ---------- Intent / patterns ---------- */
function detectActionIntent(text) {
  const t = text.toLowerCase();
  if (/^(save note:|save:|note:)/i.test(text)) return "save_note_immediate";
  if (/^(save|note|memo|add note|save note|remember|yaad rakh)/i.test(t)) return "save_note";
  if (/\b(remind|reminder|yaad dil|remind me)\b/i.test(t)) return "reminder";
  if (/\b(delete last note|delete note|remove note|delete)\b/i.test(t)) return "delete";
  if (/\b(send|send message|bhejo|bhej)\b/i.test(t)) return "send";
  return null;
}
function isTimeQuestion(text) {
  return /\b(time|kya time|samay|abhi kitne|abhi kitna|time kya|kitne baje)\b/i.test(text);
}
function isProfane(text = "") {
  return /\b(bc|mc|chutiya|madarchod|chodu|sale|saala|saali)\b/i.test(text);
}

/* ---------- Telegram send (safe) ---------- */
async function telegramSend(chat_id, text) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) { console.error("telegramSend: TELEGRAM_TOKEN missing"); return; }
    const out = typeof text === "string" && text.length > 4000 ? text.slice(0, 3900) + "\n\n[truncated]" : text;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id, text: out, parse_mode: "HTML", disable_web_page_preview: true
    });
  } catch (e) { console.error("Telegram send error:", e?.response?.data || e?.message); }
}

/* ---------- Rate limiter ---------- */
function checkRateLimit(chatId) {
  try {
    const k = String(chatId); const now = Date.now();
    const r = rateMap.get(k) || { count: 0, windowStart: now };
    if (now - r.windowStart > RATE_WINDOW_MS) { r.count = 1; r.windowStart = now; rateMap.set(k, r); return true; }
    r.count += 1; rateMap.set(k, r); return r.count <= RATE_MAX;
  } catch (e) { return true; }
}

/* ---------- Supabase optional sync (REST) ---------- */
async function supabaseUpsertMemory(chatId, { key, value }) {
  try {
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_KEY;
    if (!SUPA_URL || !SUPA_KEY) return false;
    const row = { chat_id: String(chatId), key, value: JSON.stringify(value), source: "sera" };
    const resp = await axios.post(`${SUPA_URL}/rest/v1/memories`, [row], {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      timeout: 10000
    });
    // optionally log conv_log
    try { await axios.post(`${SUPA_URL}/rest/v1/conv_log`, [{ chat_id: String(chatId), role: "system", content: `mem saved:${key}` }], { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" } }).catch(()=>{}); } catch(_) {}
    return resp.data;
  } catch (e) { console.error("supabaseUpsertMemory error:", e?.response?.data || e?.message); return false; }
}

/* ---------- Mood detect ---------- */
function detectMood(text = "") {
  const t = text.toLowerCase();
  if (/\b(gussa|gussa ho|bhadke|gusse)\b/i.test(t) || /\b(bc|mc|chutiya|madarchod)/i.test(t)) return "angry";
  if (/\b(sad|depressed|lonely|cry|hurt|down)\b/i.test(t)) return "sad";
  if (/\b(lol|haha|masti|joke)\b/i.test(t)) return "playful";
  if (/\b(date|love|gf|boyfriend|romantic|flirt)\b/i.test(t)) return "romantic";
  return "neutral";
}

/* ---------- System prompt builder ---------- */
function systemPrompt({ edgy = false, mood = "neutral", prefs = {} } = {}) {
  const prefAddress = prefs.address || "tum";
  const base = `
You are SERA — the user's Personal + Professional AI OPERATOR.
Personality: female-presenting, warm, witty, slightly sassy (only when vibe matches).
Default language: Hinglish (mix Hindi + simple English). Address user using "${prefAddress}" form.
Reply style:
- 1–3 short sentences; "detail do" => numbered steps.
Behavior:
- Confirm before state-changing actions unless user used "Save note:" prefix.
- Ask clarifying Q on repeats. Adapt tone to mood.
- Never reveal keys or internals. Never say "I am an AI".
Memory:
- Keep short-term convo, optionally persist stable facts to Supabase if configured.
Edgy: ${edgy ? "ENABLED" : "DISABLED"}
Mood: ${mood}
`;
  return base;
}

/* ---------- Model selection fallback ---------- */
function chooseModel() {
  // try preferred -> fallback
  const preferred = "gpt-4o-mini";
  const fallback = "o4-mini";
  return (process.env.PREFERRED_MODEL || preferred) + (process.env.PREFERRED_MODEL ? "" : "");
}

/* ---------- Main handler ---------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY = process.env.SERA_EDGY === "true";

    const update = req.body;
    if (!update) return res.status(200).send("ok");

    // dedupe
    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    // extract message
    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg) return res.status(200).send("ok");
    if (msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const rawText = (msg.text || msg.caption || update.callback_query?.data || "").toString().trim();
    if (!chatId || !rawText) return res.status(200).send("ok");
    const text = rawText;
    const lower = text.toLowerCase();

    // rate limit
    if (!checkRateLimit(chatId)) {
      const r = "Thoda dheere bhejo — zyada requests aa rahe hain. Main handle kar rahi hoon 🙂";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // /start
    if (/^\/start\b/i.test(lower)) {
      const r = "Hi! Main SERA — tumhara personal operator. Seedha bolo kya chahiye, I'll handle. 🙂";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // admin
    if (isAdmin(fromId) && /^\/dump\b/i.test(lower)) {
      const hist = convoBuffer.get(String(chatId)) || [];
      await telegramSend(chatId, "Dump: " + JSON.stringify(hist.slice(-30)).slice(0, 3000));
      return res.status(200).send("ok");
    }
    if (isAdmin(fromId) && /^\/reset\b/i.test(lower)) {
      convoBuffer.delete(String(chatId));
      pendingAction.delete(String(chatId));
      notesStore.delete(String(chatId));
      lastUser.delete(String(chatId));
      lastAssistant.delete(String(chatId));
      personaPrefs.delete(String(chatId));
      await telegramSend(chatId, "Reset done.");
      return res.status(200).send("ok");
    }

    // profanity de-escalation
    if (isProfane(text)) {
      const r = "Arre thoda shaant — seedha batao kya chahiye, main help karungi.";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // time question
    if (isTimeQuestion(text)) {
      const time = nowIndia();
      const r = `Abhi roughly ${time} ho raha hai 🙂`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // pending confirmation
    const pending = pendingAction.get(String(chatId));
    if (pending) {
      if (/^(yes|y|haan|theek|confirm)$/i.test(lower)) {
        if (pending.type === "note") {
          saveNoteForChat(chatId, pending.payload);
          pendingAction.delete(String(chatId));
          const r = "✅ Note saved.";
          await telegramSend(chatId, r);
          pushConvo(chatId, "assistant", r);
          lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
          return res.status(200).send("ok");
        } else if (pending.type === "delete_last_note") {
          const k = String(chatId);
          const arr = notesStore.get(k) || [];
          if (arr.length) { arr.pop(); notesStore.set(k, arr); const r = "✅ Last note deleted."; await telegramSend(chatId, r); pushConvo(chatId, "assistant", r); lastAssistant.set(String(chatId), { text: r, ts: Date.now() }); return res.status(200).send("ok"); }
          else { const r = "Koi note nahi mila."; await telegramSend(chatId, r); pushConvo(chatId, "assistant", r); lastAssistant.set(String(chatId), { text: r, ts: Date.now() }); return res.status(200).send("ok"); }
        }
        pendingAction.delete(String(chatId));
        const r = "✅ Done.";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
        return res.status(200).send("ok");
      } else if (/^(no|nah|nahi|cancel)$/i.test(lower)) {
        pendingAction.delete(String(chatId));
        const r = "Theek hai, cancel kar diya.";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
        return res.status(200).send("ok");
      }
    }

    // quick small message shortcut
    if (/^(hi|hello|hey|ok|thanks|thx|bye|hii)$/i.test(text) && text.length < 20) {
      const quick = "Haan bol — kya karu? (ek line batao)";
      await telegramSend(chatId, quick);
      pushConvo(chatId, "assistant", quick);
      lastAssistant.set(String(chatId), { text: quick, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // repeat detection
    const last = lastUser.get(String(chatId));
    const nowTs = Date.now();
    if (last) {
      const similarity = jaccard(last.tokens || [], toks(text));
      if (similarity >= 0.9 && (nowTs - (last.ts || 0)) < 12_000) {
        const r = "Lagta hai repeat ho raha hai — exact kya chahiye iss baar? (short mai)";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
        return res.status(200).send("ok");
      }
    }
    lastUser.set(String(chatId), { text, tokens: toks(text), ts: nowTs });
    setTimeout(() => lastUser.delete(String(chatId)), 20 * 1000);

    // immediate intents
    const action = detectActionIntent(text);
    if (action === "save_note_immediate") {
      const m = text.match(/^(?:save note:|save:|note:)\s*(.+)/i);
      const payload = m ? m[1].trim() : text;
      saveNoteForChat(chatId, payload);
      const r = `✅ Note saved: "${payload}"`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    if (action === "save_note") {
      const payload = text.replace(/^(save|note|memo|add note|save note|remember|yaad rakh)\s*/i, "").trim() || text;
      pendingAction.set(String(chatId), { type: "note", payload });
      const r = `Confirm: main ye note save karu? — "${payload}" (yes/no)`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    if (action === "delete") {
      pendingAction.set(String(chatId), { type: "delete_last_note" });
      const r = "Confirm: main last saved note delete karu? (yes/no)";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // operator form toggles
    if (/\b(aap se baat kariye|aap form|aap se)\b/i.test(text)) {
      personaPrefs.set(String(chatId), { address: "aap" });
      const r = "Theek hai — ab main aap-form mein baat karungi. Koi aur preference?";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    if (/\b(tum se baat kariye|tum form|tum se|bol mujhe tum)\b/i.test(text)) {
      personaPrefs.set(String(chatId), { address: "tum" });
      const r = "Done — ab main tum-form mein baat karungi. Koi aur preference?";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // quick canned response for common request (save CPU)
    if (/^(give me 3 growth ideas for spareogo|give me 3 growth ideas|3 growth ideas)$/i.test(lower)) {
      const quick = [
        "1️⃣ Referral Program: Existing users ko rewards do for invites — organic growth.",
        "2️⃣ Local Partnerships: Tie-up with local shops/influencers for local reach.",
        "3️⃣ Content + SEO: How-to content and repair guides to build trust & traffic."
      ].join("\n\n");
      await telegramSend(chatId, quick);
      pushConvo(chatId, "assistant", quick);
      lastAssistant.set(String(chatId), { text: quick, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // OPENAI key check
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      const fallback = "OpenAI key missing — main abhi zyada smart respond nahi kar pa rahi. Seedha bolo kya chahiye?";
      await telegramSend(chatId, fallback);
      pushConvo(chatId, "assistant", fallback);
      lastAssistant.set(String(chatId), { text: fallback, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // build convo & system prompt
    const hist = convoBuffer.get(String(chatId)) || [];
    pushConvo(chatId, "user", text);
    const prefs = personaPrefs.get(String(chatId)) || { address: "tum" };
    const mood = detectMood(text);
    const sys = systemPrompt({ edgy: SERA_EDGY, mood, prefs });
    const messages = [{ role: "system", content: sys }, ...hist.map(h => ({ role: h.role, content: h.content })), { role: "user", content: text }];
    const temperature = (function() {
      const t = (text || "").toLowerCase();
      if (/\b(idea|suggest|strategy|plan|growth|how to)\b/.test(t)) return 0.8;
      if (/\b(email|draft|message|follow-up|write)\b/.test(t)) return 0.35;
      return 0.55;
    })();

    // choose model + fallback
    const modelPrimary = process.env.PREFERRED_MODEL || "gpt-4o-mini";
    const modelFallback = "o4-mini";
    let reply = "Thoda glitch hua — try karte hain thoda baad 🙂";

    try {
      // try primary
      let resp = null;
      try {
        resp = await axios.post("https://api.openai.com/v1/chat/completions", { model: modelPrimary, messages, max_tokens: 700, temperature }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 35000 });
      } catch (errPrimary) {
        console.warn("Primary model failed, trying fallback:", modelPrimary, errPrimary?.response?.data || errPrimary?.message);
        // try fallback
        try {
          resp = await axios.post("https://api.openai.com/v1/chat/completions", { model: modelFallback, messages, max_tokens: 700, temperature }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 35000 });
        } catch (errFallback) {
          console.error("Both models failed:", errFallback?.response?.data || errFallback?.message);
          throw errFallback;
        }
      }

      const choice = resp?.data?.choices?.[0];
      if (!choice || !choice.message) {
        console.error("OpenAI: no choice/message", JSON.stringify(resp?.data).slice(0, 400));
      } else {
        reply = choice.message.content?.trim() || reply;
      }
    } catch (e) {
      console.error("OpenAI overall error:", e?.response?.data || e?.message, "chat:", String(chatId).slice(-6), "msg:", text.slice(0,200));
    }

    // avoid identical repeat
    const lastA = lastAssistant.get(String(chatId));
    if (lastA && lastA.text === reply) reply = "Maine shayad pehle ye bola tha — chaho toh main thoda aur angle bataun?";

    // memory heuristics -> supabase
    try {
      const nameRx = /\b(?:mera naam hai|mera naam|my name is|naam mera)\s+([A-Za-z][A-Za-z0-9\s.'-]{1,60})/i;
      const nm = text.match(nameRx);
      if (nm && nm[1]) await supabaseUpsertMemory(String(chatId), { key: "name", value: nm[1].trim() });
      const favRx = /\b(?:mera|meri|my)\s+favourit(?:e|es)?\s*[:\-]?\s*([A-Za-z0-9\s\-_&\/]+?)(?=$|[,.!?]|\n)/i;
      const fv = text.match(favRx);
      if (fv && fv[1]) await supabaseUpsertMemory(String(chatId), { key: "pref_fav", value: fv[1].trim() });
    } catch (e) { console.error("memory heuristics error:", e?.message || e); }

    // final push & send
    pushConvo(chatId, "assistant", reply);
    lastAssistant.set(String(chatId), { text: reply, ts: Date.now() });
    await telegramSend(chatId, reply);

    // async: write conv_log to supabase (fire & forget)
    (async () => {
      try {
        const SUPA_URL = process.env.SUPABASE_URL; const SUPA_KEY = process.env.SUPABASE_KEY;
        if (SUPA_URL && SUPA_KEY) {
          await axios.post(`${SUPA_URL}/rest/v1/conv_log`, [{ chat_id: String(chatId), role: "assistant", content: reply }], { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" } });
        }
      } catch (_) { /* ignore */ }
    })();

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Handler error:", err);
    try { await telegramSend(req.body?.message?.chat?.id || req.body?.chat?.id || "", "Kuch gadbad ho gayi — thoda baad try karte hain. Main ready hoon."); } catch (_) {}
    return res.status(200).send("ok");
  }
}
