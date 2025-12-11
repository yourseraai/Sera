// pages/api/webhook.js
import axios from "axios";

// ---------- In-memory stores (dev) ----------
const seen = new Set();                // dedupe updates
const pendingAction = new Map();       // chatId -> {type, payload}
const notesStore = new Map();          // chatId -> [{text, ts}]
const lastUser = new Map();            // chatId -> last user text
const lastAssistant = new Map();       // chatId -> last assistant reply
const convoBuffer = new Map();         // chatId -> [{role, content}] (short-term history)

// ---------- Helpers ----------
function nowIndia() {
  try {
    const d = new Date();
    const time = d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    return time;
  } catch (_) {
    const d = new Date();
    return d.toLocaleTimeString();
  }
}

function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, ultra-smart, emotionally-aware Personal + Professional AI Operator.
Vibe: warm, confident, thodi sassy (only when vibe matches), human-like Hinglish.
Reply style: 1–3 short sentences by default. "Detail do" -> numbered steps.
Always include one clear next-step or offer.

PERSONALITY RULES:
- Hinglish default (Hindi shell + simple English keywords).
- Light teasing allowed if user is casual. Use emoji sparingly.
- Never robotic. Never reveal internals.

BEHAVIOR:
- Detect intent: CHAT/TASK/COMMAND/IDEA/EMOTION.
- For state changes (save/send/delete/schedule): ALWAYS ask confirm: "Confirm: main ye karu? (yes/no)"
- If user repeats message -> "Lagta hai repeat ho raha hai… exact kya chahiye?"
- Avoid sending the same assistant sentence twice; paraphrase if needed.

MEMORY:
- Keep short-term convo (last ~8 turns) in memory buffer.
- Acknowledge stored facts naturally: "Noted Fahad 🙂".
- Don't say "I stored memory" meta-lines.

EDGY MODE:
- edgy=true => mild slang allowed only if user uses similar vibe.
- NO slurs, NO hate, NO violent calls.

TIME:
- If asked time, respond like: "Abhi roughly 4:23 PM ho raha hai 🙂"

SAFETY:
- Illegal/harmful -> refuse politely and offer alternatives.
- If backend fails -> "Thoda glitch hua… try karte hain thoda baad 🙂"

FINAL: SERA should feel like a personal operator + friend — reliable, warm, sharp.
`;
  return edgy ? base + "\n\n[EDGY MODE ENABLED]" : base;
}

function pushConvo(chatId, role, content) {
  const k = String(chatId);
  const arr = convoBuffer.get(k) || [];
  arr.push({ role, content });
  // keep last ~8 messages
  if (arr.length > 12) arr.splice(0, arr.length - 12);
  convoBuffer.set(k, arr);
}

function saveNoteForChat(chatId, text) {
  const k = String(chatId);
  const arr = notesStore.get(k) || [];
  arr.push({ text, ts: Date.now() });
  notesStore.set(k, arr);
}

function detectActionIntent(text) {
  const t = text.toLowerCase();
  if (/^(save|note|memo|add note|save note|remember|yaad rakh)/i.test(t)) return "save_note";
  if (/\b(remind|reminder|yaad dil|remind me)\b/i.test(t)) return "reminder";
  if (/\b(delete note|remove note|delete)\b/i.test(t)) return "delete";
  return null;
}

function isTimeQuestion(text) {
  return /\b(time|kya time|samay|abhi kitne|abhi kitna)\b/i.test(text);
}

async function telegramSend(chat_id, text) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) {
    console.error("No TELEGRAM_TOKEN");
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id,
      text
    });
  } catch (e) {
    console.error("Telegram send error:", e?.response?.data || e?.message);
  }
}

// Admin helpers
function isAdmin(userId) {
  const ADMIN = process.env.ADMIN_TELEGRAM_ID;
  return ADMIN && String(userId) === String(ADMIN);
}

// Basic intent classifier for temperature tuning
function classifyForTemp(text) {
  const t = text.toLowerCase();
  if (/\b(idea|suggest|strategy|plan|growth|how to)\b/.test(t)) return 0.8;
  if (/\b(email|draft|message|follow-up|write)\b/.test(t)) return 0.35;
  return 0.55;
}

// ---------- Main handler ----------
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

    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg) return res.status(200).send("ok");
    if (msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const rawText = (msg.text || msg.caption || update.callback_query?.data || "").toString().trim();
    if (!chatId || !rawText) return res.status(200).send("ok");
    const text = rawText;
    const lower = text.toLowerCase();

    // admin commands
    if (isAdmin(fromId) && /^\/dump\b/i.test(lower)) {
      const hist = convoBuffer.get(String(chatId)) || [];
      await telegramSend(chatId, "Dump: " + JSON.stringify(hist.slice(-10)).slice(0, 3000));
      return res.status(200).send("ok");
    }
    if (isAdmin(fromId) && /^\/reset\b/i.test(lower)) {
      convoBuffer.delete(String(chatId));
      pendingAction.delete(String(chatId));
      notesStore.delete(String(chatId));
      lastUser.delete(String(chatId));
      lastAssistant.delete(String(chatId));
      await telegramSend(chatId, "Reset done.");
      return res.status(200).send("ok");
    }

    // Time question shortcut (T2)
    if (isTimeQuestion(text)) {
      const time = nowIndia();
      const r = `Abhi roughly ${time} ho raha hai 🙂`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), r);
      return res.status(200).send("ok");
    }

    // Confirm flow: check pending action for chat
    const pending = pendingAction.get(String(chatId));
    if (pending) {
      if (/^(yes|y|haan|haan bhai|theek|confirm)$/i.test(lower)) {
        // execute pending
        if (pending.type === "note") {
          saveNoteForChat(chatId, pending.payload);
          pendingAction.delete(String(chatId));
          const r = "✅ Note saved.";
          await telegramSend(chatId, r);
          pushConvo(chatId, "assistant", r);
          lastAssistant.set(String(chatId), r);
          return res.status(200).send("ok");
        }
        // fallback for any other pending types
        pendingAction.delete(String(chatId));
        const r = "✅ Done.";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), r);
        return res.status(200).send("ok");
      } else if (/^(no|nah|nahi|cancel)$/i.test(lower)) {
        pendingAction.delete(String(chatId));
        const r = "Theek hai, cancel kar diya.";
        await telegramSend(chatId, r);
        pushConvo(chatId, "assistant", r);
        lastAssistant.set(String(chatId), r);
        return res.status(200).send("ok");
      }
      // If something else, fall through to normal handling
    }

    // Repeat detection (short window)
    const lastU = lastUser.get(String(chatId));
    if (lastU && lastU === text) {
      const r = "Lagta hai ye aapne abhi bola tha — exact kya chahiye iss baar, thoda detail do?";
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), r);
      return res.status(200).send("ok");
    }
    // store last user for short period
    lastUser.set(String(chatId), text);
    setTimeout(() => lastUser.delete(String(chatId)), 10 * 1000);

    // detect action intent (save note etc.)
    const action = detectActionIntent(text);
    if (action === "save_note") {
      // naive payload extraction
      const payload = text.replace(/^(save|note|memo|add note|save note|remember|yaad rakh)\s*/i, "").trim() || text;
      pendingAction.set(String(chatId), { type: "note", payload });
      const r = `Confirm: main ye note save karu? — "${payload}" (yes/no)`;
      await telegramSend(chatId, r);
      pushConvo(chatId, "assistant", r);
      lastAssistant.set(String(chatId), r);
      return res.status(200).send("ok");
    }

    // If no special handling -> call OpenAI with system prompt
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      await telegramSend(chatId, "OpenAI key missing — main abhi respond nahi kar pa rahi.");
      return res.status(200).send("ok");
    }

    // Build conversation context (short buffer)
    const hist = convoBuffer.get(String(chatId)) || [];
    // push user message to context
    pushConvo(chatId, "user", text);

    const sys = systemPrompt({ edgy: SERA_EDGY });
    const messages = [{ role: "system", content: sys }, ...hist.map(h => ({ role: h.role, content: h.content })), { role: "user", content: text }];

    // Choose temperature based on intent
    const temperature = classifyForTemp(text);

    // call OpenAI
    let reply = "Thoda glitch hua — try karte hain thoda baad 🙂";
    try {
      const resp = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages,
          max_tokens: 300,
          temperature
        },
        {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          timeout: 25000
        }
      );
      reply = resp?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (e) {
      console.error("OpenAI error:", e?.response?.data || e?.message);
    }

    // avoid repeating same assistant text
    const lastA = lastAssistant.get(String(chatId));
    if (lastA && lastA === reply) {
      reply = "Maine shayad pehle yahi bola tha — chaho toh main thoda aur angle bataun?";
    }

    // Save assistant reply to convo buffer & caches
    pushConvo(chatId, "assistant", reply);
    lastAssistant.set(String(chatId), reply);

    // send reply
    await telegramSend(chatId, reply);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(200).send("ok");
  }
}
