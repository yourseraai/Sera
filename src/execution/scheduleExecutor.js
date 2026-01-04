const parseTime = require("../core/timeParser")
const jobQueue = require("../jobs/jobQueue")
const createJob = require("../jobs/scheduledJob")
const actionRepo = require("../memory/actionRepo")

module.exports = function scheduleExecutor({ ctx, text, send }) {
  if (!text) {
    return "⚠️ Kya follow-up ya reminder set karna hai, thoda clearly likhiye — SERA"
  }

  const executeAt = parseTime(text)

  const action = {
    id: Date.now().toString(),
    text: text,
    executeAt,
    status: "PENDING",
    createdAt: Date.now()
  }

  actionRepo.add(ctx.businessId, action)

  jobQueue.add(
    createJob({
      runAt: executeAt,
      run() {
        send(
          ctx.userId,
          `🔔 Reminder / Follow-up:\n"${text}"\n— SERA`
        )
      }
    })
  )

  return "✅ Action scheduled successfully — SERA"
}
