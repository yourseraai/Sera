require("dotenv").config()
const express = require("express")

const app = express()

// 🔥 MUST: body parser sabse upar
app.use(express.json())

// 🔌 SERA Telegram Operator Receiver
require("./src/channels/telegram/receiver")(app)

// 🟢 Health check
app.get("/", (req, res) => {
  res.send("SERA running")
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 SERA running on port ${PORT}`)
})
