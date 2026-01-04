module.exports = function createScheduledJob({ runAt, run }) {
  return {
    runAt,
    done: false,
    run
  }
}
