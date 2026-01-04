const auditRepo = require("../memory/auditRepo")

module.exports = function dashboardAPI(app) {
  // Audit logs
  app.get("/dashboard/audit", (req, res) => {
    res.json({
      success: true,
      data: auditRepo.all()
    })
  })

  // Basic status
  app.get("/dashboard/status", (req, res) => {
    res.json({
      service: "SERA",
      status: "running"
    })
  })
}
