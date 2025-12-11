//start//
import axios from "axios";

export default async function handler(req, res) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // Sanity check
    if (!OPENAI_API_KEY) {
      console.log("OPENAI KEY MISSING");
      return res.status(200).send("OpenAI key missing — ping reply only.");
    }

    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      return res.status(200).send("No text");
    }

    const userText = message.text;
    const chatId = message.chat.id;

    // Call OPENAI API
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tum Sera ho — ek friendly Hinglish AI bot." },
          { role: "user", content: userText }
        ],
        max_tokens: 150
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = aiRes.data.choices[0].message.content;

    // Send reply to Telegram
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: reply
      }
    );

    return res.status(200).send("OK");
  } catch (e) {
    console.error("ERROR:", e?.response?.data || e.message);
    return res.status(200).send("Error happened");
  }
}
