// pages/api/webhook.js
// SERA — paste-ready final handler
// Copy -> replace -> commit -> push -> redeploy

import axios from "axios";

/* ---------- In-memory stores (dev only) ---------- */
const seen = new Set();                     // dedupe updates
const pendingAction = new Map();            // chatId -> {type, payload}
const notesStore = new Map();               // chatId -> [{text, ts}]
const lastUser = new Map();                 // chatId -> {text, tokens, ts}
const lastAssistant = new Map();            // chatId -> {text, ts}
const convoBuffer = new Map();              // chatId -> [{role, content, ts}]
const rateMap = new Map();                  // chatId -> {count, windowStart}
const personaPrefs = new Map();             // chatId -> {address: 'tum'|'aap'}

/* ---------- Configs ---------- */
const RATE_WINDOW_MS = 10_000;   // 10s window
const RATE_MAX = 25;             // max msgs per window

/* ---------- Helpers ---------- */

// Admin helper
function isAdmin(userId) {
  const ADMIN = process.env.ADMIN_TELEGRAM_ID;
  return ADMIN && String(userId) === String(ADMIN);
}

// Rate limiter per chat
function checkRateLimit(chatId) {
  try {
    const k = String(chatId);
    const now = Date.now();
    const r = rateMap.get(k) || { count: 0, windowStart: now };
    if (now - r.windowStart > RATE_WINDOW_MS) {
      r.count = 1;
      r.windowStart = now;
      rateMap.set(k, r);
      return true;
    } else {
      r.count += 1;
      rateMap.set(k, r);
      if (r.count > RATE_MAX) return false;
      return true;
    }
  } catch (e) {
    return true;
  }
}

// Time helper (Asia/Kolkata)
function nowIndia() {
  try {
    const d = new Date();
    return d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (_) {
    return new Date().toLocaleTimeString();
  }
}

// Normalize & token helpers
function normalize(s = "") {
  return s.toString().toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function toks(s = "") {
  return normalize(s).split(" ").filter(Boolean);
}
function jaccard(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni === 0 ? 0 : inter / uni;
}

// pushConvo: safe short-term conversation buffer
function pushConvo(chatId, role, content) {
  try {
    const k = String(chatId);
    const arr = convoBuffer.get(k) || [];
    arr.push({ role, content, ts: Date.now() });
    if (arr.length > 14) arr.splice(0, arr.length - 14);
    convoBuffer.set(k, arr);
  } catch (e) {
    console.error("pushConvo error:", e?.message || e);
  }
}

// Save note locally (dev) + async supabase sync (optional)
function saveNoteForChat(chatId, text) {
  try {
    const k = String(chatId);
    const arr = notesStore.get(k) || [];
    arr.push({ text, ts: Date.now() });
    notesStore.set(k, arr);
    // async supabase sync (fire & forget)
    supabaseUpsertMemory(k, { key: `note_${Date.now()}`, value: text }).catch(e => {
      console.error("supabase sync failed:", e?.message || e);
    });
    return true;
  } catch (e) {
    console.error("saveNoteForChat error:", e?.message || e);
    return false;
  }
}

// Action detection
function detectActionIntent(text) {
  const t = text.toLowerCase();
  if (/^(save note:|save:|note:)/i.test(text)) return "save_note_immediate";
  if (/^(save|note|memo|add note|save note|remember|yaad rakh)/i.test(t)) return "save_note";
  if (/\b(remind|reminder|yaad dil|remind me)\b/i.test(t)) return "reminder";
  if (/\b(delete last note|delete note|remove note|delete)\b/i.test(t)) return "delete";
  if (/\b(send|send message|bhej|bhejo)\b/i.test(t)) return "send";
  return null;
}

// Quick reply shortcuts for very short messages
function quickReply(text) {
  const t = text.toLowerCase().trim();
  if (["hi", "hello", "hey", "hii", "hlo"].includes(t)) return "Hi! Kaise ho? Batao main kya karu? 🙂";
  if (["ok", "okay", "thik", "theek"].includes(t)) return "Theek hai — batao next kya chahiye.";
  return null;
}

// Profanity check for de-escalation
function isProfane(text = "") {
  return /\b(bc|mc|chutiya|madarchod|chodu|sale|saala|saali)\b/i.test(text);
}

// Is user asking for time?
function isTimeQuestion(text) {
  return /\b(time|kya time|samay|abhi kitne|abhi kitna|time kya|kitne baje)\b/i.test(text);
}

// Safe Telegram send (uses axios)
async function telegramSend(chat_id, text) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
      console.error("telegramSend: TELEGRAM_TOKEN missing");
      return;
    }
    let out = typeof text === "string" ? text : JSON.stringify(text);
    // remove unsupported markdown that could break parse
    out = out.replace(/[_*~`]/g, "");
    if (out.length > 4000) out = out.slice(0, 3900) + "\n\n[truncated]";
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id,
      text: out,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error("Telegram send error:", e?.response?.data || e?.message);
  }
}

// Supabase optional sync (uses REST insert into 'memories' table)
async function supabaseUpsertMemory(chatId, { key, value }) {
  try {
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_KEY;
    if (!SUPA_URL || !SUPA_KEY) return false;
    const row = { chat_id: String(chatId), key, value: JSON.stringify(value), source: "sera" };
    await axios.post(`${SUPA_URL}/rest/v1/memories`, [row], {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      timeout: 10000
    });
    return true;
  } catch (e) {
    console.error("supabaseUpsertMemory error:", e?.response?.data || e?.message);
    return false;
  }
}

/* ---------- System prompt builder ---------- */
function systemPrompt({ edgy = false, mood = "neutral", prefs = {} } = {}) {
  const prefAddress = prefs.address || "tum";
  const base = `
You are SERA — the user's Personal + Professional AI OPERATOR.
Personality: Female-presenting, warm, witty, slightly sassy (only when vibe matches). Default language: Hinglish.
Address form: "${prefAddress}" (use respectfully).
Reply style: 1-3 short sentences; "detail do" -> numbered steps.
Rules:
- Always confirm before state-changing actions unless user used "Save note:" prefix.
- If user repeats near-exact messages, ask clarifying question.
- Adapt tone to mood (angry->calm, sad->soft, playful->teasing, professional->crisp).
- Don't reveal API keys, internals or chain-of-thought. Never say "I am an AI".
- Use 0-2 purposeful emojis. No slurs or harmful content.
Memory and behavior: Use short-term convo (last 10-12 turns). Persist stable facts optionally to DB.
Edgy mode: ${edgy ? "ENABLED" : "DISABLED"}
Mood: ${mood}
Final goal: Be the user's operator — reduce friction, save time, and provide clear next-step actions.
`;
  return base;
}

/* ---------- Temperature classifier ---------- */
function classifyForTemp(text) {
  const t = (text || "").toLowerCase();
  if (/\b(idea|suggest|strategy|plan|growth|how to)\b/.test(t)) return 0.8;
  if (/\b(email|draft|message|follow-up|write)\b/.test(t)) return 0.35;
  return 0.55;
}

/* ---------- Mood detection ---------- */
function detectMood(text = "") {
  const t = text.toLowerCase();
  if (/\b(gussa|gussa ho|bhadke|gusse)\b/i.test(t) || /\b(bc|mc|chutiya|madarchod)\b/i.test(t)) return "angry";
  if (/\b(sad|depressed|lonely|cry|hurt|down)\b/i.test(t)) return "sad";
  if (/\b(lol|haha|masti|joke)\b/i.test(t)) return "playful";
  if (/\b(date|love|gf|boyfriend|romantic|flirt)\b/i.test(t)) return "romantic";
  return "neutral";
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

    // dedupe updates
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

    // rate-limit check
    if (!checkRateLimit(chatId)) {
      const r = "Thoda slow kar do — zyada fast messages aa rahe hain. Main handle kar rahi hoon. 🙂";
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
      const r = "Arre — thoda shaant. Seedha batao kya chahiye, main help karungi.";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // time question shortcut
    if (isTimeQuestion(text)) {
      const time = nowIndia();
      const r = `Abhi roughly ${time} ho raha hai 🙂`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // pending confirmation flow
    const pending = pendingAction.get(String(chatId));
    if (pending) {
      if (/^(yes|y|haan|haan bhai|theek|confirm)$/i.test(lower)) {
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
          if (arr.length) {
            arr.pop();
            notesStore.set(k, arr);
            const r = "✅ Last note deleted.";
            await telegramSend(chatId, r);
            pushConvo(chatId, "assistant", r);
            lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
            return res.status(200).send("ok");
          } else {
            const r = "Koi note nahi mila.";
            await telegramSend(chatId, r);
            pushConvo(chatId, "assistant", r);
            lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
            return res.status(200).send("ok");
          }
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
      // else fallthrough
    }

    // quick short replies
    const q = quickReply(text);
    if (q) {
      await telegramSend(chatId, q);
      pushConvo(chatId, "assistant", q);
      lastAssistant.set(String(chatId), { text: q, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // repeat detection using jaccard + time window
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
    // store last user short-window
    lastUser.set(String(chatId), { text, tokens: toks(text), ts: nowTs });
    setTimeout(() => lastUser.delete(String(chatId)), 20 * 1000);

    // detect action intent
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
    } else if (action === "save_note") {
      const payload = text.replace(/^(save|note|memo|add note|save note|remember|yaad rakh)\s*/i, "").trim() || text;
      pendingAction.set(String(chatId), { type: "note", payload });
      const r = `Confirm: main ye note save karu? — "${payload}" (yes/no)`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    } else if (action === "delete") {
      pendingAction.set(String(chatId), { type: "delete_last_note" });
      const r = "Confirm: main last saved note delete karu? (yes/no)";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // operator-form switching (aap/tum)
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

    // if no OPENAI key, graceful fallback
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      const fallback = "OpenAI key missing — main abhi zyada smart respond nahi kar pa rahi. Seedha bolo kya chahiye?";
      await telegramSend(chatId, fallback);
      pushConvo(chatId, "assistant", fallback);
      lastAssistant.set(String(chatId), { text: fallback, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // Build conversation context and call OpenAI
    const hist = convoBuffer.get(String(chatId)) || [];
    pushConvo(chatId, "user", text);

    const prefs = personaPrefs.get(String(chatId)) || { address: "tum" };
    const mood = detectMood(text);
    const sys = systemPrompt({ edgy: SERA_EDGY, mood, prefs });

    const messages = [
      { role: "system", content: sys },
      ...hist.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: text }
    ];
    const temperature = classifyForTemp(text);

    // Quick curated shortcut (common phrase)
    if (/^(give me 3 growth ideas for spareogo|give me 3 growth ideas|3 growth ideas)$/i.test(text.toLowerCase())) {
      const quick = [
        "1️⃣ Referral Program: Existing users ko rewards do — organic growth.",
        "2️⃣ Local Partnerships: Tie-up with local shops/influencers for credibility & reach.",
        "3️⃣ Content + SEO: Helpful content (how-tos, repair guides) to build trust & organic traffic."
      ].join("\n\n");
      await telegramSend(chatId, quick);
      pushConvo(chatId, "assistant", quick);
      lastAssistant.set(String(chatId), { text: quick, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // Call OpenAI
    let reply = "Thoda glitch hua — try karte hain thoda baad 🙂";
    try {
      const resp = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages,
          max_tokens: 600,
          temperature
        },
        {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          timeout: 35000
        }
      );

      const choice = resp?.data?.choices?.[0];
      if (!choice || !choice.message) {
        console.error("OpenAI: no choice/message", JSON.stringify(resp?.data).slice(0, 300));
      } else {
        reply = choice.message.content?.trim() || reply;
      }
    } catch (e) {
      console.error("OpenAI error:", e?.response?.data || e?.message, "user:", String(chatId).slice(-6));
    }

    // Avoid duplicate exact assistant replies
    const lastA = lastAssistant.get(String(chatId));
    if (lastA && lastA.text === reply) {
      reply = "Maine shayad pehle ye bola tha — chaho toh main thoda aur angle bataun?";
    }

    // Heuristic memory extraction (non-blocking)
    try {
      const nameRx = /\b(?:mera naam hai|mera naam|my name is|naam mera)\s+([A-Za-z][A-Za-z0-9\s.'-]{1,60})/i;
      const nm = text.match(nameRx);
      if (nm && nm[1]) {
        const k = String(chatId);
        supabaseUpsertMemory(k, { key: "name", value: nm[1].trim() }).catch(()=>{});
      }
      const favRx = /\b(?:mera|meri|my)\s+favourit(?:e|es)?\s*[:\-]?\s*([A-Za-z0-9\s\-_&\/]+?)(?=$|[,.!?]|\n)/i;
      const fv = text.match(favRx);
      if (fv && fv[1]) {
        const k = String(chatId);
        supabaseUpsertMemory(k, { key: `pref_fav`, value: fv[1].trim() }).catch(()=>{});
      }
    } catch (e) {
      console.error("memory heuristic error:", e?.message || e);
    }

    // send and save
    pushConvo(chatId, "assistant", reply);
    lastAssistant.set(String(chatId), { text: reply, ts: Date.now() });
    await telegramSend(chatId, reply);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Handler error:", err);
    try {
      const chatId = req.body?.message?.chat?.id || req.body?.chat?.id || "";
      if (chatId) {
        await telegramSend(chatId, "Kuch gadbad ho gayi — thoda baad try karte hain. Main ready hoon.");
      }
    } catch (e) { /* ignore */ }
    return res.status(200).send("ok");
  }
}
