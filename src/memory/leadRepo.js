const leads = {}

module.exports = {
  add(businessId, lead) {
    if (!leads[businessId]) leads[businessId] = []
    leads[businessId].push(lead)
  },

  getPending(businessId) {
    return (leads[businessId] || []).filter(l => l.status === "PENDING")
  },

  markDone(businessId, phone) {
    const list = leads[businessId] || []
    const lead = list.find(l => l.phone === phone)
    if (lead) lead.status = "DONE"
  }
}
