// pages/api/webhook.js
import axios from "axios";
import {
  nowIndia,
  getCountryInfo,
  getTimeForCountry,
  convertCurrency,
  convertCurrencyForCountry,
  pushConvo,
  telegramSend,
  isAdmin,
  systemPrompt,
  cleanText,
  mkKey,
} from "../../lib/seraHelpers";

// ---------- In-memory stores (dev) ----------
const seen = new Set();                // dedupe updates
const pendingAction = new Map();       // chatId -> {type, payload, createdAt}
const notesStore = new Map();          // chatId -> [{text, ts}]
const lastUser = new Map();            // chatId -> {text, ts}
const lastAssistant = new Map();       // chatId -> last assistant reply
const convoBuffer = new Map();         // chatId -> [{role, content, ts}]
const modes = new Map();               // chatId -> { operator: bool, edgy: bool, tone: 'casual' }

// -------------------- Small helpers --------------------
function saveNoteForChat(chatId, text) {
  const k = mkKey(chatId);
  const arr = notesStore.get(k) || [];
  arr.push({ text, ts: Date.now() });
  notesStore.set(k, arr);
  return arr.length;
}

function getLastNote(chatId) {
  const arr = notesStore.get(mkKey(chatId)) || [];
  return arr.length ? arr[arr.length - 1] : null;
}

function listNotes(chatId) {
  return notesStore.get(mkKey(chatId)) || [];
}

function setMode(chatId, patch = {}) {
  const k = mkKey(chatId);
  const cur = modes.get(k) || { operator: false, edgy: false, tone: "casual" };
  modes.set(k, { ...cur, ...patch });
}

function getMode(chatId) {
  return modes.get(mkKey(chatId)) || { operator: false, edgy: false, tone: "casual" };
}

function isYes(text) { return /^(yes|y|haan|haan bhai|theek|confirm|ok|okey|sure)$/i.test(cleanText(text)); }
function isNo(text)  { return /^(no|nah|nahi|cancel)$/i.test(cleanText(text)); }

// Simple intent detection
function detectIntent(text) {
  const t = (text || "").toLowerCase();
  if (/\b(time|kya time|abhi kitne|samay|timezone|what time|convert)\b/.test(t)) {
    if (/\b(inr|usd|eur|convert|to)\b/.test(t)) return "currency";
    return "time";
  }
  if (/^(save|note|remember|yaad rakh|add note)/i.test(t)) return "save_note";
  if (/\b(delete note|remove note|delete last|delete)\b/i.test(t)) return "delete_note";
  if (/\b(draft|email|message|follow-up|follow up|followup|send mail|send email)\b/i.test(t)) return "draft";
  if (/\b(remind|reminder|yaad dil|remind me)\b/i.test(t)) return "reminder";
  if (/\b(reset|\/reset)\b/i.test(t)) return "admin_reset";
  return "chat";
}

// Build OpenAI messages with short history
function buildMessages(chatId, sysPrompt, userText) {
  const hist = convoBuffer.get(mkKey(chatId)) || [];
  const msgs = [{ role: "system", content: sysPrompt }];
  for (const h of hist) {
    if (h.role && h.content) msgs.push({ role: h.role, content: h.content });
  }
  msgs.push({ role: "user", content: userText });
  return msgs;
}

async function callOpenAI(apiKey, messages, model = "gpt-4o-mini", max_tokens = 400, temperature = 0.45) {
  const url = "https://api.openai.com/v1/chat/completions";
  const body = { model, messages, max_tokens, temperature };
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const resp = await axios.post(url, body, { headers, timeout: 30000 });
  return resp?.data?.choices?.[0]?.message?.content;
}

// -------------------- Main handler --------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY_GLOBAL = process.env.SERA_EDGY === "true";

    const update = req.body;
    if (!update) return res.status(200).send("ok");

    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg) return res.status(200).send("ok");
    if (msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const rawText = cleanText(msg.text || msg.caption || update.callback_query?.data || "");
    if (!chatId || !rawText) return res.status(200).send("ok");
    const text = rawText;
    const lower = text.toLowerCase();

    // admin commands
    if (isAdmin(fromId) && /^\/dump\b/i.test(lower)) {
      const hist = convoBuffer.get(mkKey(chatId)) || [];
      await telegramSend(chatId, "Dump: " + JSON.stringify(hist.slice(-10)).slice(0, 3000));
      return res.status(200).send("ok");
    }
    if (isAdmin(fromId) && /^\/reset\b/i.test(lower)) {
      convoBuffer.delete(mkKey(chatId));
      pendingAction.delete(mkKey(chatId));
      notesStore.delete(mkKey(chatId));
      lastUser.delete(mkKey(chatId));
      lastAssistant.delete(mkKey(chatId));
      modes.delete(mkKey(chatId));
      await telegramSend(chatId, "Reset done.");
      return res.status(200).send("ok");
    }

    // ensure mode initialized
    if (!modes.has(mkKey(chatId))) {
      setMode(chatId, { operator: false, edgy: SERA_EDGY_GLOBAL, tone: "casual" });
    }

    // pending actions (confirm flow)
    const pending = pendingAction.get(mkKey(chatId));
    if (pending) {
      if (isYes(text)) {
        if (pending.type === "note") {
          saveNoteForChat(chatId, pending.payload);
          pendingAction.delete(mkKey(chatId));
          const r = "✅ Note saved.";
          await telegramSend(chatId, r);
          pushConvo(convoBuffer, chatId, "assistant", r);
          lastAssistant.set(mkKey(chatId), r);
          return res.status(200).send("ok");
        }
        // fallback
        pendingAction.delete(mkKey(chatId));
        const r = "✅ Done.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      } else if (isNo(text)) {
        pendingAction.delete(mkKey(chatId));
        const r = "Theek hai, cancel kar diya.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
    }

    // repeat detection
    const lastU = lastUser.get(mkKey(chatId));
    if (lastU && lastU.text === text && (Date.now() - lastU.ts) < 9000) {
      const r = "Lagta hai ye aapne abhi bola tha — exact kya chahiye iss baar, thoda detail do?";
      await telegramSend(chatId, r);
      pushConvo(convoBuffer, chatId, "assistant", r);
      lastAssistant.set(mkKey(chatId), r);
      return res.status(200).send("ok");
    }
    lastUser.set(mkKey(chatId), { text, ts: Date.now() });
    setTimeout(() => lastUser.delete(mkKey(chatId)), 10 * 1000);

    const intent = detectIntent(text);

    // Time intent
    if (intent === "time") {
      // check country mention
      const countryMatch = text.match(/\b(in|at|for)\s+([A-Za-z\s]{2,40})\b/i);
      if (countryMatch) {
        const country = countryMatch[2].trim();
        const tRes = await getTimeForCountry(country);
        if (tRes.ok) {
          const parts = tRes.timezones.map(z => `• ${z.tz}: ${z.time}`).join("\n");
          const r = `${tRes.country}:\n${parts}`;
          await telegramSend(chatId, r);
          pushConvo(convoBuffer, chatId, "assistant", r);
          lastAssistant.set(mkKey(chatId), r);
          return res.status(200).send("ok");
        } else {
          const r = `Abhi roughly ${nowIndia()} ho raha hai (India). Agar specific country bologe toh bata dungi.`;
          await telegramSend(chatId, r);
          pushConvo(convoBuffer, chatId, "assistant", r);
          lastAssistant.set(mkKey(chatId), r);
          return res.status(200).send("ok");
        }
      } else {
        const r = `Abhi roughly ${nowIndia()} ho raha hai 🙂`;
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
    }

    // Currency intent
    if (intent === "currency") {
      try {
        const m = text.match(/([\d,\.]+)\s*(inr|usd|eur|gbp|jpy|aud|cad)?\s*(?:to|=>|-)\s*(inr|usd|eur|gbp|jpy|aud|cad)?/i);
        if (m && m[1]) {
          const amount = Number(m[1].replace(/,/g, ""));
          let from = (m[2] || "").toUpperCase();
          let to = (m[3] || "").toUpperCase();
          if (!from) from = "INR";
          if (!to) to = "USD";
          const conv = await convertCurrency(amount || 1, from, to);
          if (conv.ok) {
            const r = `${amount} ${from} ≈ ${Number(conv.result).toLocaleString()} ${to} (approx)`;
            await telegramSend(chatId, r);
            pushConvo(convoBuffer, chatId, "assistant", r);
            lastAssistant.set(mkKey(chatId), r);
            return res.status(200).send("ok");
          }
        }
        // try country-to-country
        const cm = text.match(/\b([A-Za-z\s]{3,40})\s+to\s+([A-Za-z\s]{3,40})\b/i);
        if (cm) {
          const conv2 = await convertCurrencyForCountry(1, cm[1].trim(), cm[2].trim());
          if (conv2.ok) {
            const r = `1 ${cm[1].trim()} ≈ ${Number(conv2.result).toLocaleString()} ${Object.keys((await getCountryInfo(cm[2].trim())).currencies || {USD:{}})[0]}`;
            await telegramSend(chatId, r);
            pushConvo(convoBuffer, chatId, "assistant", r);
            lastAssistant.set(mkKey(chatId), r);
            return res.status(200).send("ok");
          }
        }
        const r = "Convert format: `Convert 100 INR to USD` — aise try karo.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      } catch (e) {
        console.error("currency intent error", e?.message || e);
        const r = "Currency ka kuch gadbad hua — try karte hain baad me.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
    }

    // Save note
    if (intent === "save_note") {
      const payload = text.replace(/^(save|note|memo|add note|save note|remember|yaad rakh)\s*/i, "").trim() || text;
      if (getMode(chatId).operator) {
        saveNoteForChat(chatId, payload);
        const r = `✅ Note auto-saved: "${payload}"`;
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      } else {
        pendingAction.set(mkKey(chatId), { type: "note", payload, createdAt: Date.now() });
        const r = `Confirm: main ye note save karu? — "${payload}" (yes/no)`;
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
    }

    // Delete note
    if (intent === "delete_note") {
      const last = getLastNote(chatId);
      if (!last) {
        const r = "Koi note nahi mila to delete karne ke liye.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
      pendingAction.set(mkKey(chatId), { type: "delete_note", payload: last, createdAt: Date.now() });
      const r = `Confirm: main last saved note delete karu? — "${last.text}" (yes/no)`;
      await telegramSend(chatId, r);
      pushConvo(convoBuffer, chatId, "assistant", r);
      lastAssistant.set(mkKey(chatId), r);
      return res.status(200).send("ok");
    }

    // Draft / follow-up
    if (intent === "draft") {
      // require minimal details unless operator mode
      const needsDetails = !/\b(client|name|invoice|amount|payment|amount)\b/i.test(text);
      if (needsDetails && !getMode(chatId).operator) {
        const ask = "Draft ke liye kuch details chahiye (client name / amount / tone). Thoda bata do, please.";
        await telegramSend(chatId, ask);
        pushConvo(convoBuffer, chatId, "assistant", ask);
        lastAssistant.set(mkKey(chatId), ask);
        return res.status(200).send("ok");
      }
      if (!OPENAI_API_KEY) {
        const r = "OpenAI key missing — draft abhi nahi bana pa rahi. Main template de sakti hoon.";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
      try {
        pushConvo(convoBuffer, chatId, "user", text);
        const sys = systemPrompt({ edgy: getMode(chatId).edgy });
        const messages = buildMessages(chatId, sys, text);
        const modelReply = await callOpenAI(OPENAI_API_KEY, messages, "gpt-4o-mini", 500, 0.35);
        const header = "Yeh raha draft/follow-up message:";
        await telegramSend(chatId, header);
        await telegramSend(chatId, modelReply || "Kuch error hua — template neeche hai:\n[Your draft here]");
        const footer = "Kaisa laga? Koi edit chahiye? (reply: edit/yes/no)";
        await telegramSend(chatId, footer);
        pushConvo(convoBuffer, chatId, "assistant", header);
        pushConvo(convoBuffer, chatId, "assistant", modelReply || "");
        pushConvo(convoBuffer, chatId, "assistant", footer);
        lastAssistant.set(mkKey(chatId), modelReply || header);
        return res.status(200).send("ok");
      } catch (e) {
        console.error("draft error", e?.response?.data || e?.message);
        const r = "Draft banane me kuch gadbad hua. Main ek simple template de deti hoon:\nSubject: [Subject]\n\nBody: [Message body]\n\nKya chahiye aur detail?";
        await telegramSend(chatId, r);
        pushConvo(convoBuffer, chatId, "assistant", r);
        lastAssistant.set(mkKey(chatId), r);
        return res.status(200).send("ok");
      }
    }

    // General chat -> call OpenAI
    if (!OPENAI_API_KEY) {
      const r = "OpenAI key missing — main abhi respond nahi kar pa rahi. Env set kar de.";
      await telegramSend(chatId, r);
      return res.status(200).send("ok");
    }

    try {
      // add user to buffer
      pushConvo(convoBuffer, chatId, "user", text);
      const sys = systemPrompt({ edgy: getMode(chatId).edgy });
      const messages = buildMessages(chatId, sys, text);
      const temp = /\b(idea|plan|strategy|growth|how to|suggest)\b/i.test(text) ? 0.7 : 0.45;

      let reply = null;
      try {
        reply = await callOpenAI(OPENAI_API_KEY, messages, "gpt-4o-mini", 350, temp);
      } catch (e) {
        console.error("OpenAI call failed:", e?.response?.data || e?.message);
      }

      if (!reply) {
        if (/hi|hello|hey/i.test(text)) reply = `Hey! Kaise ho? Thoda glitch hua tha par main yahin hoon. Ab bol, kya chahiye?`;
        else if (/help|what can you do|kya kar sakti/i.test(text)) reply = `Main yeh kar sakti hoon: messages draft karna, reminders, notes, follow-ups, quick ideas. Bol kaun sa chahiye?`;
        else reply = `Thoda glitch hua — thoda baad try karte hain. Meanwhile bol do main kya karun: 1) note save 2) quick idea?`;
      }

      const lastA = lastAssistant.get(mkKey(chatId));
      if (lastA && lastA === reply) {
        reply = "Maine shayad pehle yahi bola tha — chaho toh main thoda aur angle bataun?";
      }

      pushConvo(convoBuffer, chatId, "assistant", reply);
      lastAssistant.set(mkKey(chatId), reply);
      await telegramSend(chatId, reply);
      return res.status(200).send("ok");
    } catch (err) {
      console.error("handler main error:", err?.response?.data || err?.message || err);
      const fallback = "Kuch gadbad ho gayi — thoda der baad try karte hain. Main yahin hoon.";
      await telegramSend(chatId, fallback);
      return res.status(200).send("ok");
    }
  } catch (err) {
    console.error("outer handler error:", err?.message || err);
    return res.status(200).send("ok");
  }
}
