const leadRepo = require("../memory/leadRepo")
const jobQueue = require("../jobs/jobQueue")
const createFollowUpJob = require("../jobs/followUpJob")
const parseTime = require("../core/timeParser")

module.exports = function followUpExecutor({ ctx, text, send }) {
  const parts = text.split(" ")
  const name = parts[2]
  const phone = parts[3]

  const followUpAt = parseTime(text)

  const lead = {
    name,
    phone,
    followUpAt,
    status: "PENDING"
  }

  leadRepo.add(ctx.businessId, lead)

  jobQueue.add(
    createFollowUpJob({
      businessId: ctx.businessId,
      lead,
      send
    })
  )

  return `✅ Follow-up scheduled for ${name} — SERA`
}
