require("dotenv").config();

const express = require("express");
const telegramReceiver = require("./channels/telegram/receiver");

const app = express();

/**
 * Middleware
 */
app.use(express.json());

/**
 * 🔍 HEALTH CHECK (MANDATORY)
 * Browser /ping hit karega → confirm server alive
 */
app.get("/ping", (req, res) => {
  console.log("🟢 PING HIT");
  res.status(200).send("pong");
});

/**
 * 🔑 ENV CHECK (ONLY FOR DEBUG – REMOVE LATER)
 */
console.log(
  "🔑 TELEGRAM_BOT_TOKEN AT START =",
  process.env.TELEGRAM_BOT_TOKEN ? "SET ✅" : "MISSING ❌"
);

/**
 * 🤖 TELEGRAM WEBHOOK
 * Telegram sirf isi route pe hit karega
 */
app.post("/telegram/webhook", async (req, res) => {
  console.log("📩 TELEGRAM WEBHOOK HIT");
  await telegramReceiver(req, res);
});

/**
 * 🚀 START SERVER
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
