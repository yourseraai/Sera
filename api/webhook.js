import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const body = req.body || {};
    const chatId =
      body.message?.chat?.id ||
      body.edited_message?.chat?.id ||
      body.callback_query?.message?.chat?.id ||
      body.channel_post?.chat?.id ||
      (body.my_chat_member && body.my_chat_member.from?.id) ||
      null;

    const text =
      body.message?.text ||
      body.edited_message?.text ||
      body.callback_query?.data ||
      "";

    if (!chatId) return res.status(200).json({ ok: false, note: "no_chat" });

    async function send(msg) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      });
    }

    if (typeof text === "string" && text.trim().startsWith("/ping")) {
      await send("SERA online ⚡ (via Vercel)");
      return res.status(200).json({ ok: true });
    }

    if (typeof text === "string" && text.trim().length < 60 && !text.includes("?")) {
      await send("Haan bolo — Sera sun rahi hai 🙂");
      return res.status(200).json({ ok: true, used: "local" });
    }

    if (!OPENAI_API_KEY) {
      await send("OpenAI key missing — ping reply only.");
      return res.status(200).json({ ok: true, used: "no-openai" });
    }

    const llmResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "o4-mini",
        messages: [
          { role: "system", content: "You are SERA, a warm Hinglish assistant. Reply short and helpful." },
          { role: "user", content: String(text) }
        ],
        max_tokens: 180,
        temperature: 0.2
      })
    });

    const llmJson = await llmResp.json();
    const reply = llmJson?.choices?.[0]?.message?.content?.trim() || "Kuch gadbad ho gayi, try karo thoda baad.";

    await send(reply);
    return res.status(200).json({ ok: true, used: "llm" });
  } catch (err) {
    console.error("webhook err:", err);
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
