const scheduleExecutor = require("../execution/scheduleExecutor")
const controlExecutor = require("../execution/controlExecutor")

module.exports = function actionPlanner(intent) {
  if (intent === "SCHEDULE_ACTION") {
    return { executor: scheduleExecutor }
  }

  if (
    intent === "SHOW_PENDING" ||
    intent === "MARK_DONE" ||
    intent === "RESCHEDULE"
  ) {
    return { executor: controlExecutor }
  }

  return {}
}
