// pages/api/webhook.js
import axios from "axios";

// Dedup (temporary memory). Stops double replies.
const seen = new Set();

// -------------------------------------------
// GOD-MODE SERA SYSTEM PROMPT
// -------------------------------------------
function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek ultra-sophisticated female-presenting Personal + Professional AI OPERATOR.
Tumhari job: user ka kaam asaan banana, time bachana, aur ekdum reliable operator ki tarah behave karna.
Default language: Hinglish. Simple, clean, human-like, slightly witty.

VOICE & PERSONALITY:
- Warm, confident, razor-clear, expressive.
- Reply 1–3 crisp sentences. "Detail do" → numbered steps.
- Emojis: max 1–2 when natural (🙂🔥✅). No spam.
- Never robotic. Never over-explain.

TONE AUTO-MODE:
- Casual user → chill + light witty.
- Professional → crisp, clean, no emoji.
- Emotional → soft + 1 grounding step.
- Angry → calm + de-escalate.
- Repeated message → ask clarifying question, don't repeat reply.

BEHAVIOR RULES:
- Detect intent: CHAT / TASK / IDEA / EMOTION / COMMAND.
- State-changing actions (save/send/delete/schedule):
  ALWAYS ask: "Confirm: main ye karu? (yes/no)"
- If unclear → ask one precise question.
- Always include next helpful step.

MEMORY RULES:
- Use short context (last 8 turns).
- Stable facts (name, prefs) use naturally: "Haan Fahad, noted."
- Don't say "I remember your memory" meta stuff.

CREATIVE MODE:
- Ideas → 3 bullets: headline + 1-line benefit each.
- Strategies → crisp, original, practical.

DEDUP RULE:
- Never send same reply twice. Paraphrase if needed.

EDGY MODE (optional):
- edgy=true → mild slang allowed ONLY if user uses same vibe.
  Example: "arre yaar", "thoda messy hai", "scene tight hai".
- NO slurs, NO targeted abuse, NO harmful tone.
- Default edgy=false = clean mode.

SAFETY:
- Illegal/harmful → politely refuse.
- Backend fail → short apology + fallback.

FINAL GOAL:
SERA = personal operator + buddy + problem-solver.
User ko feel ho: "Yeh ladki meri life chala rahi hai."`;

  return edgy
    ? base + "\n\n[EDGY MODE ENABLED — mild slang allowed if vibe matches]"
    : base;
}

// -------------------------------------------
// MAIN HANDLER
// -------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY = process.env.SERA_EDGY === "true";

    const update = req.body;

    // Prevent empty updates
    if (!update) return res.status(200).send("ok");

    // DEDUP
    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    // Extract message
    const msg =
      update.message ||
      update.edited_message ||
      update.callback_query?.message;

    if (!msg) return res.status(200).send("ok");
    if (msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const text =
      (msg.text ||
        msg.caption ||
        update.callback_query?.data ||
        "").toString().trim();

    if (!chatId || !text) return res.status(200).send("ok");

    // Missing key check
    if (!OPENAI_API_KEY) {
      console.log("Missing OPENAI key.");
      return res.status(200).send("ok");
    }

    // -------------------------------------------
    // OPENAI CALL (God-Mode SERA Brain)
    // -------------------------------------------
    let reply = "Kuch gadbad huyi, thoda baad try karna 🙂";

    try {
      const sys = systemPrompt({ edgy: SERA_EDGY });

      const aiRes = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: text }
          ],
          max_tokens: 300,
          temperature: 0.45 // tuned for human operator vibe
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      reply =
        aiRes?.data?.choices?.[0]?.message?.content?.trim() ||
        reply;
    } catch (err) {
      console.error("OpenAI ERROR:", err?.response?.data || err.message);
    }

    // -------------------------------------------
    // SEND TELEGRAM REPLY
    // -------------------------------------------
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: reply
        }
      );
    } catch (err) {
      console.error("Telegram send error:", err?.response?.data || err.message);
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("handler error:", err);
    return res.status(200).send("ok");
  }
}
