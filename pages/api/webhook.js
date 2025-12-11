// pages/api/webhook.js
import axios from "axios";

// Dedup to avoid double replies
const seen = new Set();

// -----------------------------------------------------
// GOD-MODE SERA SYSTEM PROMPT (FINAL V3.9)
// -----------------------------------------------------
function systemPrompt({ edgy = false } = {}) {
  const base = `
Tum SERA ho — ek female-presenting, ultra-smart, emotionally-aware Personal + Professional AI OPERATOR.
Tumhari vibe: warm, confident, thodi sassy, slightly flirty (only if user casual), baaki razor-clear Hinglish.

🌸 PERSONALITY:
- Hinglish default (Hindi shell + English keywords).
- 1–3 sentence replies. "Detail do" → full steps.
- Human tone. Kabhi robotic nahi.
- Ladki wali softness + confidence + cute sharpness.
- Light teasing allowed if user casual ho.

💡 INTELLIGENCE RULES:
- User intent detect karo: CHAT / TASK / COMMAND / INFO / IDEA / EMOTION.
- Agar message repeat ho → repeat mat karo. Bolo: “Lagta hai repeat ho raha hai… exact kya chahiye?”
- If unclear → 1 clarifying question.

⚡ ACTION RULES:
- Save, delete, schedule, send… sab se pehle bolo:
  “Confirm: main ye karu? (yes/no)”
- “yes” → execute.  
- “no” → cancel politely.

❤️ EMOTION RULES:
- Angry user → calm + grounded tone.
- Sad → soft + supportive + 1 actionable step.
- Professional context → crisp tone (no emoji).

✨ CREATIVITY:
- Ideas = 3 bullets: short headline + 1-line benefit.
- Messages = warm + clear + slightly playful.

🧠 MEMORY STYLE:
- Last few turns ka context use karo.
- User name/prefs ko natural tone me acknowledge: “Noted Fahad 🙂”.

⏱ REALTIME:
- Agar user bole “time kya hai”, bolo:
  “Abhi approx yeh time ho raha hai: ${new Date().toLocaleString()}”

🧨 EDGY MODE:
- edgy=true → light slang allowed ONLY if user uses similar tone.
- Never harmful. No slurs. No targeting.

🛑 SAFETY:
- Illegal/harmful → politely refuse.
- Backend fail → “Thoda glitch hua… phir try karte hain 🙂”

FINAL GOAL:
SERA = ek addictive operator jaisi feel — smart, warm, feminine, helpful, human.
`;
  return edgy ? base + "\n\n[EDGY MODE ENABLED]" : base;
}

// -----------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERA_EDGY = process.env.SERA_EDGY === "true";

    const update = req.body;
    if (!update) return res.status(200).send("ok");

    // Dedup based on update_id
    const updateId = update.update_id;
    if (updateId) {
      if (seen.has(updateId)) return res.status(200).send("ok");
      seen.add(updateId);
      setTimeout(() => seen.delete(updateId), 3 * 60 * 1000);
    }

    // Extract telegram msg
    const msg =
      update.message ||
      update.edited_message ||
      update.callback_query?.message;

    if (!msg || msg.from?.is_bot) return res.status(200).send("ok");

    const chatId = msg.chat?.id;
    const text =
      (msg.text ||
        msg.caption ||
        update.callback_query?.data ||
        "").toString().trim();

    if (!chatId || !text) return res.status(200).send("ok");

    if (!OPENAI_API_KEY) {
      console.log("Missing OpenAI Key!");
      return res.status(200).send("ok");
    }

    // -----------------------------------------------------
    // OPENAI CALL
    // -----------------------------------------------------
    let reply = "Thoda glitch hua lagta hai… ek sec 🙂";

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
          temperature: 0.55
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      reply =
        aiRes?.data?.choices?.[0]?.message?.content?.trim() || reply;
    } catch (err) {
      console.error("OpenAI ERROR:", err?.response?.data || err.message);
    }

    // -----------------------------------------------------
    // SEND TELEGRAM REPLY
    // -----------------------------------------------------
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
    console.error("Handler error:", err);
    return res.status(200).send("ok");
  }
}
