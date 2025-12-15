// lib/seraHelpers.js
import axios from "axios";

export async function telegramSend(chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text
    }
  );
}
