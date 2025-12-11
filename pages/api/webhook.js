// pages/api/webhook.js
import axios from "axios";

// Simple in-memory stores (dev). Replace with Redis/Upstash in prod.
const seen = new Set();
const pendingAction = new Map();   // chatId -> { type: "note", payload: "text" }
const notesStore = new Map();      // chatId -> [ {text, ts} ]
const lastUser = new Map();        // chatId -> last user text
const lastAssistant = new Map();   // chatId -> last assistant reply

// ---------------------------------
// SYSTEM PROMPT (God-mode)
// ---------------------------------
function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, ultra-smart, emotionally-aware Personal + Professional AI Operator.
Tumhari vibe: warm, confident, thodi sassy, slightly flirty if vibe matches. Default: Hinglish.
Reply short (1-3 lines) unless user asks "detail do" or "step-by-step".
For any state change ask: "Confirm: main ye karu? (yes/no)"
If user repeats same message, ask: "Lagta hai repeat ho raha hai... exact kya chahiye?"
If asked time/date, bot can use system time.
Be safe and helpful.
`;
  return edgy ? base + "\n\n[EDGY MODE]" : base;
}

// Helper: save note in-memory
function saveNoteForChat(chatId, text) {
  const arr = notesStore.get(String(chatId)) || [];
  arr.push({ text, ts: Date.now() });
  notesStore.set(String(chatId), arr);
}

// Simple intent detection for action phrases
function detectActionIntent(text) {
  const t = text.toLowerCase();
  if (/^(save|note|memo|add note|save note|remember|yaad rakh)/i.test(t)) return "save_note";
  if (/\b(remind|reminder|remember to)\b/i.test(t)) return "reminder";
  return null;
}

// Detect time ask (simple)
function isTimeQuestion(text) {
  return /\b(time|kya time|samay|abhi kitne)\b/i.test(text);
}

// Send Telegram message
async function telegramSend(chat_id, text) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id,
      text
    });
  } catch (e) {
    console.error("TG send error:", e?.response?.data || e?.message);
  }
}

// Main handler
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY = process.env.SERA_EDGY === "true";

    const update = req.body;
    if (!update) return res.status(200).send("ok");

    // Dedup
    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    // Extract message
    const msg = update.message || update.edited_message || update.callback_query?.message;
    if (!msg || msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const rawText = (msg.text || msg.caption || update.callback_query?.data || "").toString().trim();
    if (!chatId || !rawText) return res.status(200).send("ok");

    const text = rawText; // keep original casing for some replies
    const lower = text.toLowerCase();

    // QUICK: If user asks time — answer locally without OpenAI
    if (isTimeQuestion(text)) {
      const now = new Date();
      const timeStr = now.toLocaleString(); // uses server timezone
      await telegramSend(chatId, `Abhi approx yeh time ho raha hai: ${timeStr}`);
      return res.status(200).send("ok");
    }

    // CHECK pending action (confirm flow)
    const pending = pendingAction.get(String(chatId));
    if (pending) {
      // user responded to confirmation
      if (/^(yes|y|haan|haan bhai|theek|confirm)$/i.test(lower)) {
        // execute pending
        if (pending.type === "note") {
          saveNoteForChat(chatId, pending.payload);
          pendingAction.delete(String(chatId));
          const r = "✅ Note saved.";
          await telegramSend(chatId, r);
          lastAssistant.set(String(chatId), r);
          return res.status(200).send("ok");
        }
        // other action types can be added here
        pendingAction.delete(String(chatId));
        await telegramSend(chatId, "✅ Done.");
        return res.status(200).send("ok");
      } else if (/^(no|nah|nahi|cancel)$/i.test(lower)) {
        pendingAction.delete(String(chatId));
        const r = "Okay, cancelled.";
        await telegramSend(chatId, r);
        lastAssistant.set(String(chatId), r);
        return res.status(200).send("ok");
      }
      // If pending exists but user typed something else, let flow continue to normal processing
    }

    // Repeat-detection: if user sends same text twice in short time, ask clarify
    const lastU = lastUser.get(String(chatId));
    if (lastU && lastU === text) {
      const r = "Lagta hai ye aapne abhi bola tha — exact kya chahiye, thoda detail do?";
      await telegramSend(chatId, r);
      lastAssistant.set(String(chatId), r);
      return res.status(200).send("ok");
    }
    // store last user for 10 seconds
    lastUser.set(String(chatId), text);
    setTimeout(() => lastUser.delete(String(chatId)), 10 * 1000);

    // Detect action intent (save note)
    const action = detectActionIntent(text);
    if (action === "save_note") {
      // extract note payload (naive)
      // remove trigger words
      const notePayload = text.replace(/^(save|note|memo|add note|save note|remember|yaad rakh)\s*/i, "").trim() || text;
      pendingAction.set(String(chatId), { type: "note", payload: notePayload });
      const r = `Confirm: main ye note save karu? — "${notePayload}" (yes/no)`;
      await telegramSend(chatId, r);
      lastAssistant.set(String(chatId), r);
      return res.status(200).send("ok");
    }

    // If no special action, build system prompt + ask OpenAI
    if (!OPENAI_API_KEY) {
      console.log("Missing OPENAI API KEY");
      await telegramSend(chatId, "OpenAI key missing — cannot process right now.");
      return res.status(200).send("ok");
    }

    // Build messages
    const sys = systemPrompt({ edgy: SERA_EDGY });
    const messages = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];

    // Call OpenAI
    let reply = "Thoda glitch hua… try karo thoda baad 🙂";
    try {
      const aiRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages,
          max_tokens: 300,
          temperature: 0.5
        },
        {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          timeout: 20000
        }
      );
      reply = aiRes?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (e) {
      console.error("OpenAI error:", e?.response?.data || e?.message);
    }

    // Avoid repeating same assistant reply
    const lastA = lastAssistant.get(String(chatId));
    if (lastA && lastA === reply) {
      const alt = "Maine shayad pehle yahi bola tha — chaho toh main thoda aur angle bataun?";
      reply = alt;
    }

    // Save assistant reply and send
    lastAssistant.set(String(chatId), reply);
    try {
      await telegramSend(chatId, reply);
    } catch (e) {
      console.error("Telegram send error", e?.response?.data || e?.message);
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(200).send("ok");
  }
}
