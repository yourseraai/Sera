// pages/api/webhook.js
import axios from "axios";
import {
  nowIndia,
  getCountryInfo,
  getTimeForCountry,
  convertCurrency,
  pushConvo,
  telegramSend,
  isAdmin,
  systemPrompt
} from "../../lib/seraHelpers";

// ---------- In-memory stores (dev) ----------
const seen = new Set();                // dedupe updates
const pendingAction = new Map();       // chatId -> {type, payload, createdAt}
const notesStore = new Map();          // chatId -> [{key?, text, ts}]
const lastUser = new Map();            // chatId -> last user text with ts
const lastAssistant = new Map();       // chatId -> last assistant reply
const convoBuffer = new Map();         // chatId -> [{role, content}] (short-term history)
const modes = new Map();               // chatId -> { operator: bool, edgy: bool }

// ---------- Helpers (local) ----------
function keyOf(chatId){ return String(chatId); }

function pushToBuffer(chatId, role, content){
  try {
    pushConvo(chatId, role, content); // assume helper does this; fallback below if not
  } catch (e) {
    // fallback: local minimal buffer push if helper signature differs
    const k = keyOf(chatId);
    const arr = convoBuffer.get(k) || [];
    arr.push({ role, content });
    if (arr.length > 12) arr.splice(0, arr.length - 12);
    convoBuffer.set(k, arr);
  }
}

// small util to detect yes/no
const yesRx = /^(yes|y|haan|haan ji|haan bhai|theek|ok|okey|ya|yaar)$/i;
const noRx = /^(no|nah|nahi|cancel|na)$/i;

// quick intent detector for notes
function detectSaveIntent(text){
  if (!text) return null;
  const t = text.toLowerCase();
  if (/^(save|note|remember|yaad rakh|add note|memo)\b/i.test(t)) return "save_note";
  if (/\b(remind|reminder|yaad dil|remind me)\b/i.test(t)) return "reminder";
  return null;
}

// ---------- MAIN HANDLER ----------
export default async function handler(req, res){
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
    const SERA_EDGY = process.env.SERA_EDGY === "true";

    const update = req.body;
    if (!update) return res.status(200).send("ok");

    // dedupe updates quickly
    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(()=> seen.delete(updateId), 3 * 60 * 1000);
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
    const kChat = keyOf(chatId);

    // admin quick commands
    if (isAdmin && isAdmin(fromId) && /^\/dump\b/i.test(text)) {
      const hist = convoBuffer.get(kChat) || [];
      await telegramSend(chatId, "Dump: " + JSON.stringify(hist.slice(-10)).slice(0,3000));
      return res.status(200).send("ok");
    }
    if (isAdmin && isAdmin(fromId) && /^\/reset\b/i.test(text)) {
      convoBuffer.delete(kChat); pendingAction.delete(kChat); notesStore.delete(kChat);
      lastUser.delete(kChat); lastAssistant.delete(kChat); modes.delete(kChat);
      await telegramSend(chatId, "Reset done.");
      return res.status(200).send("ok");
    }

    // store user short-term
    const prevU = lastUser.get(kChat);
    if (prevU && prevU.text === text && (Date.now() - prevU.ts) < 8000) {
      // genuine repeat within short window
      const r = "Lagta hai ye abhi abhi bola tha — exact kya chahiye iss baar, thoda detail do?";
      await telegramSend(chatId, r);
      pushToBuffer(chatId, "assistant", r);
      lastAssistant.set(kChat, r);
      return res.status(200).send("ok");
    }
    lastUser.set(kChat, { text, ts: Date.now() });
    setTimeout(()=> lastUser.delete(kChat), 10 * 1000);

    // Onboarding + name collection (if no saved name)
    const knownNotes = notesStore.get(kChat) || [];
    const hasName = knownNotes.some(n => (n.key === "name") || /(^name:)/i.test(n.text))
                  || ( (convoBuffer.get(kChat)||[]).some(h => /(?:mera naam|my name is|naam mera)/i.test(h.content)) );

    const greetingRe = /^(hi|hello|hey|good morning|good evening|good night|namaste|yo)\b/i;
    // If user greets and we don't have a name -> start onboarding consent
    if (!hasName && greetingRe.test(text) && !pendingAction.get(kChat)) {
      const onboarding = `Hi! Main Sera hoon — tumhara personal operator. Pehle choti si baat: kya main tumse kuch basic info le sakti ho (name/preference/timezone)? (yes/no)`;
      await telegramSend(chatId, onboarding);
      pendingAction.set(kChat, { type: "onboard_consent", payload: null, createdAt: Date.now() });
      pushToBuffer(chatId, "assistant", onboarding);
      lastAssistant.set(kChat, onboarding);
      return res.status(200).send("ok");
    }

    // handle pending flows (consent / collect_name / confirm save)
    const pending = pendingAction.get(kChat);
    if (pending) {
      // onboarding consent
      if (pending.type === "onboard_consent") {
        if (yesRx.test(text)) {
          const askName = `Thanks! Pehla: aapka naam kya hai? (e.g. "Mera naam Rohit hai")`;
          await telegramSend(chatId, askName);
          pendingAction.set(kChat, { type: "collect_name", createdAt: Date.now() });
          pushToBuffer(chatId, "assistant", askName);
          lastAssistant.set(kChat, askName);
          return res.status(200).send("ok");
        } else if (noRx.test(text)) {
          pendingAction.delete(kChat);
          const r = "Theek hai — jab chaho bata dena. Main yahin hoon 🙂";
          await telegramSend(chatId, r);
          pushToBuffer(chatId, "assistant", r);
          lastAssistant.set(kChat, r);
          return res.status(200).send("ok");
        } else {
          // ignore and let it continue
        }
      }

      // collect_name
      if (pending.type === "collect_name") {
        const nameRx = /\b(?:mera naam hai|mera naam|my name is|name is)\s+([A-Za-z][A-Za-z0-9\s.'-]{1,60})/i;
        const nm = text.match(nameRx);
        if (nm && nm[1]) {
          const savedName = nm[1].trim();
          const arr = notesStore.get(kChat) || [];
          arr.push({ key: "name", text: savedName, ts: Date.now() });
          notesStore.set(kChat, arr);
          pendingAction.delete(kChat);
          const ok = `✅ Done, ${savedName}! Ab main tumhe "${savedName}" se bulaungi. Koi aur preference bataoge?`;
          await telegramSend(chatId, ok);
          pushToBuffer(chatId, "assistant", ok);
          lastAssistant.set(kChat, ok);
          return res.status(200).send("ok");
        } else {
          // if very short reply, accept as name
          if (text.length && text.split(/\s+/).length <= 4) {
            const savedName = text.trim();
            const arr2 = notesStore.get(kChat) || [];
            arr2.push({ key: "name", text: savedName, ts: Date.now() });
            notesStore.set(kChat, arr2);
            pendingAction.delete(kChat);
            const ok2 = `✅ Name saved as "${savedName}". Ab main tumhe isi naam se bulaungi.`;
            await telegramSend(chatId, ok2);
            pushToBuffer(chatId, "assistant", ok2);
            lastAssistant.set(kChat, ok2);
            return res.status(200).send("ok");
          }
          const askAgain = `Naam samajh nahi aaya — simple way: "Mera naam Rohit hai" ya bas apna naam likh do.`;
          await telegramSend(chatId, askAgain);
          pushToBuffer(chatId, "assistant", askAgain);
          lastAssistant.set(kChat, askAgain);
          return res.status(200).send("ok");
        }
      }

      // confirm save note pending
      if (pending.type === "confirm_save") {
        if (yesRx.test(text)) {
          const payload = pending.payload || "";
          const arr = notesStore.get(kChat) || [];
          arr.push({ key: "note", text: payload, ts: Date.now() });
          notesStore.set(kChat, arr);
          pendingAction.delete(kChat);
          const r = `✅ Note saved: "${payload}"`;
          await telegramSend(chatId, r);
          pushToBuffer(chatId, "assistant", r);
          lastAssistant.set(kChat, r);
          return res.status(200).send("ok");
        } else if (noRx.test(text)) {
          pendingAction.delete(kChat);
          const r = "Theek hai, cancel kar diya.";
          await telegramSend(chatId, r);
          pushToBuffer(chatId, "assistant", r);
          lastAssistant.set(kChat, r);
          return res.status(200).send("ok");
        }
        // else fallthrough
      }
    }

    // Quick built-in shortcuts: time question
    if (/\b(time|kya time|samay|abhi kitne|abhi kitna)\b/i.test(text)) {
      const t = nowIndia ? nowIndia() : (new Date()).toLocaleTimeString("en-IN");
      const r = `Abhi roughly ${t} ho raha hai 🙂`;
      await telegramSend(chatId, r);
      pushToBuffer(chatId, "assistant", r);
      lastAssistant.set(kChat, r);
      return res.status(200).send("ok");
    }

    // Detect save note intent
    const intent = detectSaveIntent(text);
    if (intent === "save_note") {
      const payload = text.replace(/^(save|note|remember|yaad rakh|add note|memo)\s*/i, "").trim() || text;
      // operator mode: if enabled for this chat -> auto save
      const mode = modes.get(kChat) || { operator: false, edgy: false };
      if (mode.operator) {
        const arr = notesStore.get(kChat) || [];
        arr.push({ key: "note", text: payload, ts: Date.now() });
        notesStore.set(kChat, arr);
        const r = `✅ Note auto-saved: "${payload}"`;
        await telegramSend(chatId, r);
        pushToBuffer(chatId, "assistant", r);
        lastAssistant.set(kChat, r);
        return res.status(200).send("ok");
      } else {
        // ask confirm
        const ask = `Confirm: main ye note save karu? — "${payload}" (yes/no)`;
        pendingAction.set(kChat, { type: "confirm_save", payload, createdAt: Date.now() });
        await telegramSend(chatId, ask);
        pushToBuffer(chatId, "assistant", ask);
        lastAssistant.set(kChat, ask);
        return res.status(200).send("ok");
      }
    }

    // If reaches here -> use OpenAI to reply (chat behavior)
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      await telegramSend(chatId, "OpenAI key missing — main abhi respond nahi kar pa rahi.");
      return res.status(200).send("ok");
    }

    // Build small context
    const hist = convoBuffer.get(kChat) || [];
    pushToBuffer(chatId, "user", text);

    // build system prompt
    const sys = systemPrompt ? systemPrompt({ edgy: modes.get(kChat)?.edgy || SERA_EDGY }) : "Tum SERA ho — friendly Hinglish assistant.";

    const messages = [{ role: "system", content: sys }, ...hist.slice(-8).map(h=>({role:h.role, content:h.content})), { role: "user", content: text }];

    // OpenAI call
    let reply = "Thoda glitch hua — try karte hain thoda baad 🙂";
    try {
      const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        temperature: 0.45
      }, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type":"application/json" },
        timeout: 30000
      });
      reply = resp?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (err) {
      console.error("OpenAI error:", err?.response?.data || err?.message);
      // dynamic fallback for friendly behavior
      if (/^(hi|hello|hey)\b/i.test(text)) reply = "Hey! Kaise ho? Thoda glitch hua, par main yahin hoon 🙂";
      else reply = "Thoda glitch hua — main filhal limited hoon. Chaho toh main note save kar doon ya quick idea doon?";
    }

    // prevent exact repeat to user (paraphrase message)
    const lastA = lastAssistant.get(kChat);
    if (lastA && lastA === reply) {
      reply = "Maine shayad pehle yahi bola tha — chaho toh main thoda aur angle bataun?";
    }

    // push & send
    pushToBuffer(chatId, "assistant", reply);
    lastAssistant.set(kChat, reply);
    await telegramSend(chatId, reply);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("handler error:", err);
    // always return ok so Telegram doesn't retry heavily
    return res.status(200).send("ok");
  }
}
