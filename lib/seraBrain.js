// lib/seraBrain.js
import axios from "axios";

/**
 * 🌍 TIME ENGINE
 * Country → Accurate timezone
 */
export async function getTime(country) {
  const zones = {
    india: "Asia/Kolkata",
    japan: "Asia/Tokyo",
    usa: "America/New_York",
    uk: "Europe/London",
    russia: "Europe/Moscow",
    germany: "Europe/Berlin",
    france: "Europe/Paris",
    australia: "Australia/Sydney"
  };

  const key = country.toLowerCase();
  if (!zones[key]) return null;

  try {
    const res = await axios.get(
      `https://worldtimeapi.org/api/timezone/${zones[key]}`
    );

    const d = new Date(res.data.datetime);

    return {
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }),
      date: d.toISOString().split("T")[0]
    };
  } catch (err) {
    return null;
  }
}

/**
 * 💱 CURRENCY ENGINE
 */
export async function convert(from, to, amount) {
  try {
    const res = await axios.get(
      `https://api.exchangerate.host/convert`,
      {
        params: {
          from,
          to,
          amount
        }
      }
    );

    return res.data?.result ?? null;
  } catch (err) {
    return null;
  }
}
