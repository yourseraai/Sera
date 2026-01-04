const leadRepo = require("../memory/leadRepo")

module.exports = function createFollowUpJob({ businessId, lead, send }) {
  return {
    runAt: lead.followUpAt,
    done: false,
    run() {
      send(
        businessId,
        `🔔 Follow-up due:\n${lead.name} (${lead.phone}) — SERA`
      )
    }
  }
}
