import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import SearchBar from "../components/SearchBar";
import WeatherCard from "../components/WeatherCard";
import ForecastCard from "../components/ForecastCard";
import { getWeather, getAirQuality, formatHour } from "../services/api";

const STORAGE_KEY = "recentCities";

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export default function Search() {
  const [city, setCity] = useState(null);
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState(loadRecent);

  // load weather whenever a city is chosen
  useEffect(() => {
    if (!city) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [w, a] = await Promise.all([
          getWeather(city.latitude, city.longitude),
          getAirQuality(city.latitude, city.longitude),
        ]);
        if (!cancelled) {
          setWeather(w);
          setAir(a);
        }
      } catch {
        if (!cancelled) setError("Could not load weather. Check your internet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city]);

  function handleSelect(selected) {
    setCity(selected);

    // save to recent searches (no duplicates, max 6)
    const updated = [
      selected,
      ...recent.filter(
        (c) =>
          !(c.latitude === selected.latitude && c.longitude === selected.longitude)
      ),
    ].slice(0, 6);
    setRecent(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      /* ignore storage errors */
    }
  }

  const chartData = weather
    ? weather.hourly.map((h) => ({
        time: formatHour(h.time),
        temp: h.temp,
        rain: h.rainChance ?? 0,
      }))
    : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">Search weather</h2>
        <SearchBar onSelect={handleSelect} placeholder="Search any city in the world..." />
      </div>

      {/* recent searches */}
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          {recent.map((c) => (
            <button
              key={`${c.latitude}-${c.longitude}`}
              onClick={() => setCity(c)}
              className="text-sm bg-white border border-slate-200 hover:bg-sky-50 rounded-full px-3 py-1"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {!city && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          Search for a city above to see its weather.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && <p className="text-slate-500">Loading weather...</p>}

      {city && !loading && weather && (
        <>
          <WeatherCard city={city} weather={weather} air={air} />

          {/* hourly temperature chart */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Temperature, next 24 hours (°C)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={3} />
                  <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="temp"
                    name="Temp °C"
                    stroke="#0284c7"
                    strokeWidth={2}
                    fill="url(#tempFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* rain chance chart */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Chance of rain, next 24 hours (%)
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={3} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="rain" name="Rain %" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 7-day forecast */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">7-day forecast</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {weather.daily.map((day, i) => (
                <ForecastCard key={day.date} day={day} isToday={i === 0} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}