import axios from "axios";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// ---------- 1. Search cities by name ----------
export async function searchCities(query, count = 6) {
  if (!query || query.trim().length < 2) return [];
  const { data } = await axios.get(GEO_URL, {
    params: { name: query.trim(), count, language: "en", format: "json" },
  });
  return (data.results || []).map((c) => ({
    id: c.id,
    name: c.name,
    country: c.country,
    admin1: c.admin1 || "",
    latitude: c.latitude,
    longitude: c.longitude,
  }));
}

// ---------- 2. Get full weather (current + hourly + 7 day) ----------
export async function getWeather(latitude, longitude) {
  const { data } = await axios.get(WEATHER_URL, {
    params: {
      latitude,
      longitude,
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max",
      timezone: "auto",
      forecast_days: 7,
    },
  });

  const c = data.current;
  const d = data.daily;
  const h = data.hourly;

  const current = {
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    wind: Math.round(c.wind_speed_10m),
    windDirection: c.wind_direction_10m,
    pressure: Math.round(c.pressure_msl),
    precipitation: c.precipitation,
    code: c.weather_code,
    isDay: c.is_day === 1,
    time: c.time,
  };

  const daily = d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    rain: d.precipitation_sum[i],
    rainChance: d.precipitation_probability_max[i],
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
    uv: d.uv_index_max[i],
    windMax: Math.round(d.wind_speed_10m_max[i]),
  }));

  // next 24 hours, starting from the current hour
  const nowHour = c.time.slice(0, 13);
  const startIndex = Math.max(
    0,
    h.time.findIndex((t) => t.slice(0, 13) >= nowHour)
  );
  const hourly = h.time.slice(startIndex, startIndex + 24).map((time, k) => {
    const i = startIndex + k;
    return {
      time,
      temp: Math.round(h.temperature_2m[i]),
      rainChance: h.precipitation_probability[i],
      code: h.weather_code[i],
    };
  });

  return {
    current,
    daily,
    hourly,
    timezone: data.timezone,
    latitude: data.latitude,
    longitude: data.longitude,
  };
}

// ---------- 3. Air quality ----------
export async function getAirQuality(latitude, longitude) {
  try {
    const { data } = await axios.get(AIR_URL, {
      params: {
        latitude,
        longitude,
        current: "us_aqi,pm2_5,pm10",
        timezone: "auto",
      },
    });
    return {
      aqi: data.current.us_aqi,
      pm25: data.current.pm2_5,
      pm10: data.current.pm10,
    };
  } catch {
    return null;
  }
}

// ---------- 4. Weather for multiple cities (Comparison page) ----------
export async function getMultipleWeather(cities) {
  const results = await Promise.all(
    cities.map(async (city) => {
      const weather = await getWeather(city.latitude, city.longitude);
      return { city, weather };
    })
  );
  return results;
}

// ---------- 5. Get user's current location ----------
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: "My Location",
          country: "",
          admin1: "",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err)
    );
  });
}

// ---------- 6. Weather code -> label + emoji ----------
export function getWeatherInfo(code, isDay = true) {
  const map = {
    0: { label: "Clear sky", icon: isDay ? "☀️" : "🌙" },
    1: { label: "Mainly clear", icon: isDay ? "🌤️" : "🌙" },
    2: { label: "Partly cloudy", icon: "⛅" },
    3: { label: "Overcast", icon: "☁️" },
    45: { label: "Fog", icon: "🌫️" },
    48: { label: "Rime fog", icon: "🌫️" },
    51: { label: "Light drizzle", icon: "🌦️" },
    53: { label: "Drizzle", icon: "🌦️" },
    55: { label: "Heavy drizzle", icon: "🌧️" },
    61: { label: "Light rain", icon: "🌧️" },
    63: { label: "Rain", icon: "🌧️" },
    65: { label: "Heavy rain", icon: "🌧️" },
    71: { label: "Light snow", icon: "🌨️" },
    73: { label: "Snow", icon: "❄️" },
    75: { label: "Heavy snow", icon: "❄️" },
    80: { label: "Rain showers", icon: "🌦️" },
    81: { label: "Heavy showers", icon: "🌧️" },
    82: { label: "Violent showers", icon: "⛈️" },
    95: { label: "Thunderstorm", icon: "⛈️" },
    96: { label: "Thunderstorm with hail", icon: "⛈️" },
    99: { label: "Severe thunderstorm", icon: "⛈️" },
  };
  return map[code] || { label: "Unknown", icon: "❔" };
}

// ---------- 7. AQI -> label + color ----------
export function getAqiInfo(aqi) {
  if (aqi == null) return { label: "N/A", color: "text-slate-500" };
  if (aqi <= 50) return { label: "Good", color: "text-green-600" };
  if (aqi <= 100) return { label: "Moderate", color: "text-yellow-600" };
  if (aqi <= 150) return { label: "Unhealthy (sensitive)", color: "text-orange-600" };
  if (aqi <= 200) return { label: "Unhealthy", color: "text-red-600" };
  return { label: "Very unhealthy", color: "text-purple-700" };
}

// ---------- 8. Helpers ----------
export function formatDay(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
}

export function formatHour(timeStr) {
  return new Date(timeStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}

export function windDirectionText(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}