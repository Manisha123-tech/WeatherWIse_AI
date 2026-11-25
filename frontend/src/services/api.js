import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_STORAGE_KEY = "ww_auth_token";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function buildApiError(err) {
  const payload = err?.response?.data;
  const apiErr = payload?.error;
  const message =
    apiErr?.message ||
    err?.message ||
    "Request failed. Make sure the backend server is running.";
  const error = new Error(message);
  error.code = apiErr?.code || "REQUEST_FAILED";
  error.status = err?.response?.status;
  return error;
}

async function unwrap(promise) {
  try {
    const res = await promise;
    if (res.data && typeof res.data === "object" && "success" in res.data) {
      if (!res.data.success) {
        const err = new Error(res.data.error?.message || "API request failed.");
        err.code = res.data.error?.code || "API_ERROR";
        err.status = res.status;
        throw err;
      }
      return res.data.data;
    }
    return res.data;
  } catch (err) {
    if (err.code && err.status !== undefined && !err.response) throw err;
    throw buildApiError(err);
  }
}

function roundOrNull(val) {
  return val == null ? null : Math.round(val);
}

function locationParams(latitude, longitude, city) {
  if (latitude != null && longitude != null) {
    return { latitude, longitude };
  }
  if (city) {
    return { city };
  }
  return {};
}

// ---------- 0. Health ----------
export function getHealth() {
  return unwrap(apiClient.get("/api/health"));
}

// ---------- 1. Search cities by name / PIN code ----------
export async function searchCities(query, count = 8) {
  if (!query || query.trim().length < 2) return [];
  try {
    const data = await unwrap(
      apiClient.get("/api/location", {
        params: { q: query.trim(), count },
      })
    );
    return (data.locations || []).map((c) => ({
      id: c.id ?? `${c.latitude}-${c.longitude}`,
      name: c.name,
      display_name: c.display_name,
      country: c.country || "",
      admin1: c.admin1 || "",
      latitude: c.latitude,
      longitude: c.longitude,
      timezone: c.timezone || "",
    }));
  } catch (err) {
    if (err.status === 404 || err.code === "LOCATION_NOT_FOUND") {
      return [];
    }
    throw err;
  }
}

// ---------- 2. Full weather (current + hourly + 7-day daily via backend) ----------
export async function getWeather(
  latitude,
  longitude,
  { city, refresh = false, hours = 24 } = {}
) {
  const params = locationParams(latitude, longitude, city);
  if (refresh) params.refresh = "true";

  const [weatherData, forecastData] = await Promise.all([
    unwrap(apiClient.get("/api/weather", { params })),
    unwrap(
      apiClient.get("/api/forecast", {
        params: { ...params, hours },
      })
    ),
  ]);

  const c = weatherData.current || {};
  const todaySummary = weatherData.today || {};
  const dailyList = forecastData.daily || [];
  const hourlyList = forecastData.hourly || [];

  const current = {
    temp: roundOrNull(c.temperature),
    feelsLike: roundOrNull(c.feels_like),
    humidity: c.humidity,
    wind: roundOrNull(c.wind_speed),
    windDirection: c.wind_direction ?? 0,
    pressure: roundOrNull(c.pressure),
    precipitation: c.precipitation ?? 0,
    code: c.weather_code,
    condition: c.condition,
    isDay: Boolean(c.is_day),
    time: c.time,
  };

  const daily = dailyList.map((d, idx) => ({
    date: d.date,
    code: d.weather_code,
    condition: d.condition,
    max: roundOrNull(d.temp_max),
    min: roundOrNull(d.temp_min),
    rain: d.precipitation_sum ?? 0,
    rainChance: d.precipitation_probability_max ?? 0,
    sunrise: d.sunrise ?? (idx === 0 ? todaySummary.sunrise : null),
    sunset: d.sunset ?? (idx === 0 ? todaySummary.sunset : null),
    uv: d.uv_index_max ?? (idx === 0 ? todaySummary.uv_index_max : null),
    windMax: roundOrNull(d.wind_speed_max),
  }));

  const hourly = hourlyList.map((h) => ({
    time: h.time,
    temp: roundOrNull(h.temperature),
    feelsLike: roundOrNull(h.feels_like),
    humidity: h.humidity,
    rainChance: h.precipitation_probability ?? 0,
    precipitation: h.precipitation ?? 0,
    windSpeed: roundOrNull(h.wind_speed),
    code: h.weather_code,
    condition: h.condition,
  }));

  return {
    location: weatherData.location,
    current,
    today: todaySummary,
    daily,
    hourly,
    units: weatherData.units,
    timezone: weatherData.location?.timezone,
    latitude: weatherData.location?.latitude ?? latitude,
    longitude: weatherData.location?.longitude ?? longitude,
    meta: {
      source: weatherData.source,
      fetchedAt: weatherData.fetched_at,
      cached: Boolean(weatherData.cached),
      stale: Boolean(weatherData.stale || forecastData.stale),
      warning: weatherData.warning || forecastData.warning || null,
    },
  };
}

// ---------- 3. Air quality (proxied & cached by backend) ----------
export async function getAirQuality(latitude, longitude, { city, refresh = false } = {}) {
  try {
    const params = locationParams(latitude, longitude, city);
    if (refresh) params.refresh = "true";
    const data = await unwrap(apiClient.get("/api/air-quality", { params }));
    const aq = data.air_quality || {};
    return {
      aqi: aq.us_aqi ?? null,
      pm25: aq.pm2_5 ?? null,
      pm10: aq.pm10 ?? null,
      time: aq.time ?? null,
    };
  } catch {
    return null;
  }
}

// ---------- 4. Compare multiple cities/locations ----------
export function compareLocations(locations) {
  return unwrap(apiClient.post("/api/compare", { locations }));
}

// ---------- 5. Rain Arrival Estimator ----------
export function getRainEstimate(latitude, longitude, hours = 24) {
  return unwrap(
    apiClient.get("/api/rain-estimate", {
      params: { latitude, longitude, hours },
    })
  );
}

// ---------- 6. Smart Clothing & Comfort Advisor ----------
export function getClothingAdvice({
  latitude,
  longitude,
  city,
  hours = 12,
  comfort_preference = "normal",
  temperature_unit = "celsius",
}) {
  return unwrap(
    apiClient.post("/api/advisor/clothing", {
      ...locationParams(latitude, longitude, city),
      hours,
      comfort_preference,
      temperature_unit,
    })
  );
}

// ---------- 7. Weather Alerts & Advisories ----------
export function getAlerts(latitude, longitude, area) {
  const params = { latitude, longitude };
  if (area) params.area = area;
  return unwrap(apiClient.get("/api/alerts", { params }));
}

export function createOfficialAlert(payload) {
  return unwrap(apiClient.post("/api/alerts", payload));
}

// ---------- 8. AI Weather Decision Assistant ----------
export function askAssistant({ question, city, latitude, longitude, preferences }) {
  return unwrap(
    apiClient.post("/api/assistant", {
      question,
      ...locationParams(latitude, longitude, city),
      ...(preferences ? { preferences } : {}),
    })
  );
}

// ---------- 9. Weather-Based Travel Planner ----------
export function analyzeTravel(payload) {
  return unwrap(apiClient.post("/api/travel/analyze", payload));
}

// ---------- 10. Forecast Accuracy Tracker ----------
export function getAccuracyMetrics({ location_key, city, latitude, longitude } = {}) {
  const params = {};
  if (location_key) params.location_key = location_key;
  else if (latitude != null && longitude != null) {
    params.latitude = latitude;
    params.longitude = longitude;
  } else if (city) {
    params.city = city;
  }
  return unwrap(apiClient.get("/api/accuracy/metrics", { params }));
}

export function captureAccuracySnapshots(payload) {
  return unwrap(apiClient.post("/api/accuracy/snapshots", payload));
}

export function recordAccuracyObservation(payload) {
  return unwrap(apiClient.post("/api/accuracy/observations", payload));
}

// ---------- 11. Community Weather Reports ----------
export function listCommunityReports({
  status = "approved",
  verification_status,
  category,
  include_expired = false,
  latitude,
  longitude,
  radius_km,
} = {}) {
  const params = { status };
  if (verification_status) params.verification_status = verification_status;
  if (category && category !== "all") params.category = category;
  if (include_expired) params.include_expired = "true";
  if (latitude != null && longitude != null) {
    params.latitude = latitude;
    params.longitude = longitude;
    if (radius_km != null) params.radius_km = radius_km;
  }
  return unwrap(apiClient.get("/api/community/reports", { params }));
}

export function createCommunityReport(payload) {
  return unwrap(apiClient.post("/api/community/reports", payload));
}

export function moderateCommunityReport(reportId, payload) {
  return unwrap(apiClient.patch(`/api/community/reports/${reportId}/moderate`, payload));
}

export function expireCommunityReports() {
  return unwrap(apiClient.post("/api/community/reports/expire"));
}

export function deleteCommunityReport(reportId) {
  return unwrap(apiClient.delete(`/api/community/reports/${reportId}`));
}

// ---------- 12. Auth, Preferences & Saved Locations ----------
export function registerUser({ username, email, password }) {
  return unwrap(apiClient.post("/api/auth/register", { username, email, password }));
}

export function loginUser({ identifier, password }) {
  return unwrap(apiClient.post("/api/auth/login", { identifier, password }));
}

export function fetchCurrentUser() {
  return unwrap(apiClient.get("/api/auth/me"));
}

export function getPreferences() {
  return unwrap(apiClient.get("/api/preferences"));
}

export function updatePreferences(prefs) {
  return unwrap(apiClient.put("/api/preferences", prefs));
}

export function listSavedLocations() {
  return unwrap(apiClient.get("/api/saved-locations"));
}

export function addSavedLocation(location) {
  return unwrap(apiClient.post("/api/saved-locations", location));
}

export function deleteSavedLocation(id) {
  return unwrap(apiClient.delete(`/api/saved-locations/${id}`));
}

// ---------- 13. Browser geolocation ----------
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
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
        }),
      (err) => reject(err)
    );
  });
}

// ---------- 14. Weather code -> label + emoji ----------
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
    56: { label: "Light freezing drizzle", icon: "🌧️" },
    57: { label: "Dense freezing drizzle", icon: "🌧️" },
    61: { label: "Light rain", icon: "🌧️" },
    63: { label: "Rain", icon: "🌧️" },
    65: { label: "Heavy rain", icon: "🌧️" },
    66: { label: "Light freezing rain", icon: "🌧️" },
    67: { label: "Heavy freezing rain", icon: "🌧️" },
    71: { label: "Light snow", icon: "🌨️" },
    73: { label: "Snow", icon: "❄️" },
    75: { label: "Heavy snow", icon: "❄️" },
    77: { label: "Snow grains", icon: "🌨️" },
    80: { label: "Rain showers", icon: "🌦️" },
    81: { label: "Heavy showers", icon: "🌧️" },
    82: { label: "Violent showers", icon: "⛈️" },
    85: { label: "Snow showers", icon: "🌨️" },
    86: { label: "Heavy snow showers", icon: "🌨️" },
    95: { label: "Thunderstorm", icon: "⛈️" },
    96: { label: "Thunderstorm with hail", icon: "⛈️" },
    99: { label: "Severe thunderstorm", icon: "⛈️" },
  };
  return map[code] || { label: "Unknown", icon: "❔" };
}

// ---------- 15. AQI -> label + color ----------
export function getAqiInfo(aqi) {
  if (aqi == null) return { label: "N/A", color: "text-slate-500" };
  if (aqi <= 50) return { label: "Good", color: "text-green-600" };
  if (aqi <= 100) return { label: "Moderate", color: "text-yellow-600" };
  if (aqi <= 150) return { label: "Unhealthy (sensitive)", color: "text-orange-600" };
  if (aqi <= 200) return { label: "Unhealthy", color: "text-red-600" };
  return { label: "Very unhealthy", color: "text-purple-700" };
}

// ---------- 16. Unit & date/time formatting helpers ----------
export function convertTemp(tempC, unit = "celsius") {
  if (tempC == null) return null;
  if (unit === "fahrenheit") return Math.round((tempC * 9) / 5 + 32);
  return Math.round(tempC);
}

export function tempSymbol(unit = "celsius") {
  return unit === "fahrenheit" ? "°F" : "°C";
}

export function convertWind(kmh, unit = "kmh") {
  if (kmh == null) return null;
  if (unit === "mph") return Math.round(kmh * 0.621371);
  return Math.round(kmh);
}

export function windSymbol(unit = "kmh") {
  return unit === "mph" ? "mph" : "km/h";
}

export function formatDay(dateStr) {
  if (!dateStr) return "";
  const d = dateStr.length === 10 ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatHour(timeStr) {
  if (!timeStr) return "N/A";
  return new Date(timeStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: timeStr.length >= 16 && !timeStr.endsWith(":00") ? "2-digit" : undefined,
    hour12: true,
  });
}

export function windDirectionText(deg) {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
