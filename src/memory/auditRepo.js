const logs = []
module.exports = {
  log(e) { logs.push({ ...e, ts: Date.now() }) },
  all() { return logs }
}
