require("dotenv").config();
const express = require("express");
const telegramReceiver = require("./channels/telegram/receiver");

const app = express();
app.use(express.json());

console.log("🔑 TELEGRAM_BOT_TOKEN AT START =", process.env.TELEGRAM_BOT_TOKEN);

app.post("/telegram/webhook", telegramReceiver);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
