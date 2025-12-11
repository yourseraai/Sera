// pages/api/webhook.js
export default async function handler(req, res) {
  // Quick health-check for GET
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, msg: "SERA webhook alive" });
  }

  // Accept POST from Telegram
  if (req.method === "POST") {
    try {
      const body = req.body || {};
      console.log("TG webhook body:", JSON.stringify(body).slice(0,2000));

      // Immediate ack to Telegram
      res.status(200).json({ ok: true });

      // TODO: later: process message (store, reply, etc.)
      return;
    } catch (err) {
      console.error("webhook error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  }

  // Other methods
  res.setHeader("Allow", ["GET","POST"]);
  res.status(405).end("Method Not Allowed");
}
