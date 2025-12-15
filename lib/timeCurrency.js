export function getTime(country) {
  const map = {
    india: "Asia/Kolkata",
    japan: "Asia/Tokyo",
    usa: "America/New_York"
  };

  const zone = map[country.toLowerCase()];
  if (!zone) return null;

  return new Date().toLocaleTimeString("en-IN", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function convertCurrency(amount, from, to) {
  if (from === "usd" && to === "inr") return amount * 83;
  if (from === "usd" && to === "php") return amount * 57;
  return null;
}
