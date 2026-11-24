import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";

import SearchBar from "../components/SearchBar";
import WeatherCard from "../components/WeatherCard";
import ForecastCard from "../components/ForecastCard";
import {
  getWeather,
  getAirQuality,
  getUserLocation,
  getWeatherInfo,
  formatHour,
} from "../services/api";

const DEFAULT_CITY = {
  id: 1258980,
  name: "Ranchi",
  admin1: "Jharkhand",
  country: "India",
  latitude: 23.3441,
  longitude: 85.3096,
};

export default function Dashboard() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

  async function useMyLocation() {
    try {
      const loc = await getUserLocation();
      setCity(loc);
    } catch {
      setError("Location permission denied.");
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* search row */}
      <div className="flex gap-3">
        <SearchBar onSelect={setCity} />
        <button
          onClick={useMyLocation}
          className="shrink-0 flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 rounded-xl"
        >
          <LocateFixed size={18} />
          <span className="hidden sm:inline">My location</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && <p className="text-slate-500">Loading weather...</p>}

      {!loading && weather && (
        <>
          <WeatherCard city={city} weather={weather} air={air} />

          {/* hourly strip */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Next 24 hours
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {weather.hourly.map((h) => (
                <div
                  key={h.time}
                  className="min-w-[72px] bg-white border border-slate-200 rounded-xl p-3 text-center"
                >
                  <p className="text-xs text-slate-500">{formatHour(h.time)}</p>
                  <p className="text-2xl my-1">{getWeatherInfo(h.code).icon}</p>
                  <p className="text-sm font-semibold">{h.temp}°</p>
                </div>
              ))}
            </div>
          </section>

          {/* 7 day forecast */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              7-day forecast
            </h3>
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