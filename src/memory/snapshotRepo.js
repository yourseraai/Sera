const snapshots = []

module.exports = {
  save(data) {
    snapshots.push({ ...data, ts: Date.now() })
  }
}
