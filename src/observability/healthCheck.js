module.exports = function (app) {
  app.get("/health", (_, res) => {
    res.json({ status: "OK", service: "SERA Operator" })
  })
}
