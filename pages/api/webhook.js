// pages/api/webhook.js
// SERA v8.1 — Full Human Mode (bug fixes + helpers added)

import axios from "axios";

/* ---------------- In-memory stores (dev) ---------------- */
const seen = new Set();
const convoBuffer = new Map();
const pendingAction = new Map();
const notesStore = new Map();
const memoryStore = new Map();
const lastUser = new Map();
const lastAssistant = new Map();
const politenessMap = new Map();
const operatorMode = new Map();

/* ---------------- Helpers ---------------- */
function nowIndia() {
  try {
    return new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return new Date().toLocaleTimeString();
  }
}
function normalize(s = "") {
  return s.toString().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}
function tokens(s = "") {
  return normalize(s).split(" ").filter(Boolean);
}
function jaccard(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni === 0 ? 0 : inter / uni;
}
function isProfane(text = "") {
  return /\b(bc|mc|chutiya|madarchod|chodu|sale|saala|saali)\b/i.test(text || "");
}
function extractTime(text = "") {
  const t = text.toLowerCase();
  const m1 = t.match(/(\d{1,2}:\d{2}\s?(?:am|pm))/i);
  if (m1) return m1[1];
  const m2 = t.match(/(\d{1,2})\s*(baje|am|pm)/i);
  if (m2) return `${m2[1]} ${m2[2] || ""}`.trim();
  const m3 = t.match(/([01]?\d|2[0-3]):([0-5]\d)/);
  if (m3) return m3[0];
  return null;
}
function tagsFromText(text = "") {
  const t = text.toLowerCase();
  const tags = [];
  if (/\b(client|customer|client ko)\b/.test(t)) tags.push("client");
  if (/\b(call|phone|call kar|phone kar)\b/.test(t)) tags.push("call");
  if (/\b(remind|reminder|yaad|yaad dil)\b/.test(t)) tags.push("reminder");
  if (/\b(gym|workout|exercise)\b/.test(t)) tags.push("health");
  return tags;
}
function ensureMemory(chatId) {
  const k = String(chatId);
  if (!memoryStore.has(k)) memoryStore.set(k, { name: null, prefs: {}, savedFacts: [] });
  return memoryStore.get(k);
}
function saveNote(chatId, text) {
  const k = String(chatId);
  const arr = notesStore.get(k) || [];
  const obj = { text, searchable: text.toLowerCase(), tags: tagsFromText(text), ts: Date.now() };
  arr.push(obj);
  notesStore.set(k, arr);
  return obj;
}
function recallNotes(chatId, filter = null) {
  const arr = notesStore.get(String(chatId)) || [];
  if (!filter) return arr;
  const fl = filter.toLowerCase();
  return arr.filter(n => n.searchable.includes(fl) || (n.tags || []).includes(filter));
}
function pushConvo(chatId, role, content) {
  const k = String(chatId);
  const arr = convoBuffer.get(k) || [];
  arr.push({ role, content });
  if (arr.length > 12) arr.splice(0, arr.length - 12);
  convoBuffer.set(k, arr);
}
async function telegramSend(chatId, text) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) {
    console.error("Missing TELEGRAM_TOKEN");
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
    });
  } catch (e) {
    console.error("Telegram send error:", e?.response?.data || e?.message);
  }
}
function setPoliteness(chatId, v) { politenessMap.set(String(chatId), v === "aap" ? "aap" : "tum"); }
function getPoliteness(chatId) { return politenessMap.get(String(chatId)) || "tum"; }
function setOperator(chatId, v) { operatorMode.set(String(chatId), !!v); }
function getOperator(chatId) { return operatorMode.get(String(chatId)) || false; }
function isAdmin(userId) {
  const ADMIN = process.env.ADMIN_TELEGRAM_ID;
  return ADMIN && String(userId) === String(ADMIN);
}

/* ---------------- Prompt builder ---------------- */
function buildSystemPrompt(chatId, mood = "neutral", edgy = false) {
  const politeness = getPoliteness(chatId);
  return `
You are SERA — a female-presenting Personal + Professional AI OPERATOR.
Tone: warm, human, slightly sassy when allowed. Use female grammar.
Language: Hinglish by default. Pronoun style: "${politeness}".
Rules: short replies (1-3 lines), lists emoji-numbered, state-change confirmation unless explicit "save note:" prefix, never ask "Kya madad chahiye?" by default, handle profanity calmly, behave as a real operator.
Edgy mode: ${edgy ? "ENABLED" : "OFF"}.
`;
}

/* ---------------- List beautifier and context emoji ---------------- */
function chooseContextEmoji(content = "") {
  const c = content.toLowerCase();
  if (/\b(time|baje|am|pm|clock|⏰)\b/.test(c)) return "⏰";
  if (/\b(growth|scale|kpi|metric|revenue)\b/.test(c)) return "📈";
  if (/\b(fund|funding|invest|money|pay|price)\b/.test(c)) return "💰";
  if (/\b(team|hire|talent|people)\b/.test(c)) return "👥";
  if (/\b(client|customer|user|buyer)\b/.test(c)) return "👤";
  if (/\b(automate|automation|ops|system|scale)\b/.test(c)) return "⚙️";
  if (/\b(speed|fast|quick|improve)\b/.test(c)) return "⚡";
  if (/\b(lion|lion)\b/.test(c)) return "🦁";
  return "";
}
function beautifyList(text) {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n");
  const numMap = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
  const out = [];
  let idx = 1;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(""); continue; }
    const mNum = line.match(/^\s*(\d+)[\.\)]\s+(.*)/);
    const mDash = line.match(/^\s*-\s+(.*)/);
    if (mNum) {
      const content = mNum[2].trim();
      const emoji = chooseContextEmoji(content);
      const numEmoji = numMap[idx] || `${idx}️⃣`;
      out.push(`${numEmoji} ${content}${emoji ? " " + emoji : ""}`);
      idx++;
    } else if (mDash) {
      const content = mDash[1].trim();
      const emoji = chooseContextEmoji(content);
      const numEmoji = numMap[idx] || `${idx}️⃣`;
      out.push(`${numEmoji} ${content}${emoji ? " " + emoji : ""}`);
      idx++;
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/* ---------------- Repeat detection (tuned) ---------------- */
function isRepeat(chatId, text) {
  const k = String(chatId);
  const now = Date.now();
  const toks = tokens(text);
  if (toks.length < 4) return false;
  const last = lastUser.get(k);
  if (!last) return false;
  if (last.text === text && now - last.ts < 15 * 1000) return true;
  const sim = jaccard(last.tokens, toks);
  if (sim >= 0.9 && now - last.ts < 12 * 1000) return true;
  return false;
}

/* ---------------- Preference extractor ---------------- */
function tryExtractPreferences(chatId, text) {
  const lower = text.toLowerCase();
  const mem = ensureMemory(chatId);
  if (/\bchai pasand|mujhe chai\b/.test(lower)) {
    mem.prefs.favoriteDrink = "chai";
    mem.savedFacts.push({ k: "favoriteDrink", v: "chai", ts: Date.now() });
    return true;
  }
  const nameMatch = text.match(/\b(?:mera naam (?:hai|to)?|my name is)\s*([A-Za-z][A-Za-z0-9_-]{1,40})/i);
  if (nameMatch) {
    mem.name = nameMatch[1];
    mem.savedFacts.push({ k: "name", v: mem.name, ts: Date.now() });
    return true;
  }
  return false;
}

/* ---------------- Main handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY = process.env.SERA_EDGY === "true";
    const update = req.body;
    if (!update) return res.status(200).send("ok");

    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg || msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const raw = (msg.text || msg.caption || update.callback_query?.data || "").toString().trim();
    if (!chatId || !raw) return res.status(200).send("ok");
    const text = raw;
    const lower = text.toLowerCase();

    // admin commands
    if (isAdmin(fromId) && /^\/dump\b/i.test(lower)) {
      const hist = convoBuffer.get(String(chatId)) || [];
      await telegramSend(chatId, "Dump: " + JSON.stringify(hist.slice(-20)).slice(0, 3000));
      return res.status(200).send("ok");
    }
    if (isAdmin(fromId) && /^\/reset\b/i.test(lower)) {
      convoBuffer.delete(String(chatId));
      pendingAction.delete(String(chatId));
      notesStore.delete(String(chatId));
      memoryStore.delete(String(chatId));
      lastUser.delete(String(chatId));
      lastAssistant.delete(String(chatId));
      politenessMap.delete(String(chatId));
      operatorMode.delete(String(chatId));
      await telegramSend(chatId, "Reset done.");
      return res.status(200).send("ok");
    }

    // politeness toggles
    if (/\b(aap se baat|aapse baat|aap se)\b/i.test(lower)) {
      setPoliteness(chatId, "aap");
      const r = "Theek hai Wolf — ab main aap-form (aap) se baat karungi. Bataiye kya chahiye? 🙂";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    if (/\b(tum bolo|tum se|tum kar)\b/i.test(lower) || /\b(client bole tum bolo)\b/i.test(lower)) {
      setPoliteness(chatId, "tum");
      const r = "Done — ab main tum-form (tum) se baat karungi. Bata de kya chahiye?";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // profanity early handling
    if (isProfane(text)) {
      setPoliteness(chatId, "aap");
      const r = "Arre Wolf, thoda shaant ho jao — seedha batao kya chahiye, main help karungi.";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // operator toggle
    if (/^(operator mode on|operator mode off|operator on|operator off|operator mode)$/i.test(lower)) {
      const on = /on/i.test(lower);
      setOperator(chatId, on);
      const r = on ? "Operator mode ON — strict, professional responses unless told otherwise." : "Operator mode OFF — normal friendly mode.";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // immediate-save prefix
    const immediateSaveMatch = text.match(/^\s*(save note|note|save)\s*[:\-]\s*(.+)/i);
    if (immediateSaveMatch) {
      const payload = immediateSaveMatch[2].trim();
      const saved = saveNote(chatId, payload);
      tryExtractPreferences(chatId, payload);
      const r = `✅ Note saved: "${payload}"${saved.tags && saved.tags.length ? " (" + saved.tags.join(",") + ")" : ""}`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // pending confirm flow
    const pending = pendingAction.get(String(chatId));
    if (pending) {
      if (/^(yes|y|haan|haan bhai|theek|confirm)$/i.test(lower)) {
        if (pending.type === "note") {
          const saved = saveNote(chatId, pending.payload);
          tryExtractPreferences(chatId, pending.payload);
          pendingAction.delete(String(chatId));
          const r = `✅ Note saved: "${pending.payload}"`;
          await telegramSend(chatId, r);
          pushConvo(chatId, "assistant", r);
          lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
          return res.status(200).send("ok");
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

    // repeat detection
    if (isRepeat(chatId, text)) {
      const r = "Wolf, lagta hai aap ye cheez important repeat kar rahe ho — batao kis angle se chahiye? (short mai)";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    lastUser.set(String(chatId), { text, norm: normalize(text), tokens: tokens(text), ts: Date.now() });
    setTimeout(() => lastUser.delete(String(chatId)), 15 * 1000);

    // action detection (save without prefix)
    if (/^(save|note|remember|yaad rakh)\b/i.test(lower)) {
      const payload = text.replace(/^(save|note|memo|remember|yaad rakh)\s*/i, "").trim() || text;
      pendingAction.set(String(chatId), { type: "note", payload });
      const timeFound = extractTime(payload);
      const r = `Confirm: main ye note save karu? — "${payload}" ${timeFound ? `(time: ${timeFound})` : ""} (yes/no)`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }
    if (/\b(delete last note|delete note|remove note|delete)\b/i.test(lower)) {
      pendingAction.set(String(chatId), { type: "delete_last_note" });
      const r = "Confirm: main last saved note delete karu? (yes/no)";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // client-call retrieval
    if (/\b(client|client ko|client call|client se)\b/i.test(lower) && /\b(kitne|kab|baje|kabhi)\b/i.test(lower)) {
      const notes = recallNotes(chatId, "client");
      if (notes && notes.length) {
        const found = [...notes].reverse().find(n => extractTime(n.text));
        if (found) {
          const t = extractTime(found.text);
          const r = `Us note me likha tha: "${found.text}" — time: ${t}`;
          await telegramSend(chatId, r);
          pushConvo(chatId, "assistant", r);
          lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
          return res.status(200).send("ok");
        } else {
          const r = `Client-call note mila: "${notes[notes.length-1].text}" — time specify nahi tha. Bol do main save kar doon.`;
          await telegramSend(chatId, r);
          pushConvo(chatId, "assistant", r);
          lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
          return res.status(200).send("ok");
        }
      }
      const r = "Mujhe koi client-call note nahi mila. Aap bata dein kab karna hai, main save kar doon.";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // time question
    if (/\b(time|kya time|samay|abhi kitne|kitne baje|abhi kitna)\b/i.test(lower)) {
      const r = `Abhi roughly ${nowIndia()} ho raha hai 🙂`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // capability menu
    if (/\b(kya kar sakti|kya kar sakti ho|kya karogi|kya kar sakti ho tum)\b/i.test(lower)) {
      const r = `Main yeh kar sakti hoon, Wolf:\n1️⃣ Client messages / follow-ups (draft & send)\n2️⃣ Reminders & scheduling ⏰\n3️⃣ Lead qualification & filter\n4️⃣ Notes & memory (save/recall) 👤\n5️⃣ Quick ideas/strategy 📈\nBol: 1/2/3/4/5 ya 'detail do' for any item.`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // preferences query
    if (/\b(meri preferences|meri pasand|meri preference|what do you remember|meri details)\b/i.test(lower)) {
      const mem = ensureMemory(chatId);
      const parts = [];
      if (mem.name) parts.push(`name: ${mem.name}`);
      if (mem.prefs.favoriteDrink) parts.push(`favoriteDrink: ${mem.prefs.favoriteDrink}`);
      if (!parts.length) {
        const r = "Abhi tak koi khas preference save nahi hai. Bolo, main save kar doon?";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
        return res.status(200).send("ok");
      }
      const r = `Maine yeh yaad rakha hai — ${parts.join("; ")}.`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), { text: r, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // small preference capture
    tryExtractPreferences(chatId, text);

    // fallback to OpenAI
    if (!OPENAI_API_KEY) {
      const fallback = "OpenAI key missing — abhi simple replies de pa rahi hoon. Bolo seedha kya chahiye?";
      await telegramSend(chatId, fallback);
      pushConvo(chatId, "assistant", fallback);
      lastAssistant.set(String(chatId), { text: fallback, ts: Date.now() });
      return res.status(200).send("ok");
    }

    // LLM call
    const mood = isProfane(text) ? "angry" : (/\b(sad|depressed|lonely|hurt)\b/i.test(lower) ? "sad" : "neutral");
    const sys = buildSystemPrompt(chatId, mood, SERA_EDGY);
    const hist = convoBuffer.get(String(chatId)) || [];
    pushConvo(chatId, "user", text);
    const messages = [{ role: "system", content: sys }, ...hist.map(h => ({ role: h.role, content: h.content })), { role: "user", content: text }];
    const temperature = /\b(idea|strategy|growth|plan)\b/i.test(lower) ? 0.8 : 0.45;

    let reply = "Thoda glitch hua — try karte hain thoda baad 🙂";
    try {
      const resp = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        { model: "gpt-4o-mini", messages, max_tokens: 450, temperature },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
      );
      reply = resp?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (e) {
      console.error("OpenAI error:", e?.response?.data || e?.message);
    }

    // gender lock
    reply = reply.replace(/\bkar raha hoon\b/gi, "kar rahi hoon").replace(/\bkar raha\b/gi, "kar rahi").replace(/\bbola tha\b/gi, "boli thi").replace(/\bbola hai\b/gi, "boli hai");

    // beautify lists
    try { reply = beautifyList(reply); } catch (e) { console.error("Beautify failed", e); }

    // avoid exact repeat
    const lastA = lastAssistant.get(String(chatId));
    if (lastA && lastA.text === reply) {
      reply = "Maine pehle bhi yahi bataya tha — chaho toh main ek naya angle bata doon?";
    }

    pushConvo(chatId, "assistant", reply);
    lastAssistant.set(String(chatId), { text: reply, ts: Date.now() });
    await telegramSend(chatId, reply);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(200).send("ok");
  }
}
