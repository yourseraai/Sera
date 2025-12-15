export function getTimeByCountry(country) {
  const zones = {
    india: "Asia/Kolkata",
    usa: "America/New_York",
    japan: "Asia/Tokyo"
  };

  const zone = zones[country];
  if (!zone) return null;

  return new Date().toLocaleTimeString("en-IN", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit"
  });
}
