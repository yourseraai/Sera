// src/index.js

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const telegramReceiver = require("./channels/telegram/receiver");

const app = express();
app.use(bodyParser.json());

// 🔥 HARD PROOF LOG
console.log("🔑 TELEGRAM_BOT_TOKEN AT START =", process.env.TELEGRAM_BOT_TOKEN);

app.get("/", (req, res) => {
  res.send("SERA is alive");
});

app.post("/telegram/webhook", telegramReceiver);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
