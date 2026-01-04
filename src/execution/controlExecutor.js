const actionRepo = require("../memory/actionRepo")
const parseTime = require("../core/timeParser")
const jobQueue = require("../jobs/jobQueue")
const createJob = require("../jobs/scheduledJob")

module.exports = function controlExecutor({ ctx, text, intent, send }) {
  const t = text.toLowerCase()

  // SHOW PENDING
  const formatTime = require("../utils/timeFormatter")
const groupActions = require("../utils/groupActions")

// inside executor
if (intent === "SHOW_PENDING") {
  const pending = actionRepo.getPending(ctx.businessId)

  if (!pending.length) {
    return "✅ Koi pending follow-up / reminder nahi hai — SERA"
  }

  const { today, tomorrow } = groupActions(pending)

  let reply = `📋 Pending Actions (${pending.length})\n\n`

  if (today.length) {
    reply += "🟡 Today\n"
    today.forEach((a, i) => {
      reply += `${i + 1}️⃣ ${a.text} (${formatTime(a.executeAt)})\n`
    })
    reply += "\n"
  }

  if (tomorrow.length) {
    reply += "🟢 Tomorrow\n"
    tomorrow.forEach((a, i) => {
      reply += `${i + 1}️⃣ ${a.text} (${formatTime(a.executeAt)})\n`
    })
    reply += "\n"
  }

  reply += "Reply with:\n• done <name>\n• reschedule <name> <time>\n\n— SERA"

  return reply
}

  // MARK DONE
  if (intent === "MARK_DONE") {
    const keyword = t.replace("done", "").trim()
    const action = actionRepo.markDone(ctx.businessId, keyword)

    if (!action) {
      return "⚠️ Koi matching pending action nahi mila — SERA"
    }

    return "✅ Action marked as done — SERA"
  }

  // RESCHEDULE
  if (intent === "RESCHEDULE") {
    const newTime = parseTime(text)
    const keyword = t.replace("reschedule", "").trim()

    const action = actionRepo.reschedule(ctx.businessId, keyword, newTime)

    if (!action) {
      return "⚠️ Koi matching pending action nahi mila — SERA"
    }

    jobQueue.add(
      createJob({
        runAt: newTime,
        run() {
          send(
            ctx.userId,
            `🔔 Rescheduled action:\n"${action.text}" — SERA`
          )
        }
      })
    )

    return "🔁 Action rescheduled successfully — SERA"
  }

  return null
}
