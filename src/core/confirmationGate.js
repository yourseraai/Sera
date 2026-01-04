module.exports = function confirmationGate(plan, confirmed = false) {
  if (plan.needsConfirmation && !confirmed) {
    return { status: "WAIT_CONFIRM" }
  }
  return { status: "OK" }
}
