import { useEffect, useState } from "react";
import axios from "axios";
import { MapPin, CalendarDays, Droplets, Star, CheckSquare, Square } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import SearchBar from "../components/SearchBar";
import { getWeatherInfo } from "../services/api";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MAX_AHEAD_DAYS = 15; // forecast limit
const MAX_TRIP_DAYS = 14;

// ---------- date helpers (local time, avoids timezone bugs) ----------
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function prettyDate(str) {
  return new Date(`${str}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function tripDays(start, end) {
  const ms = new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`);
  return Math.round(ms / 86400000) + 1;
}

// ---------- API ----------
async function loadTrip(latitude, longitude, start, end) {
  const { data } = await axios.get(WEATHER_URL, {
    params: {
      latitude,
      longitude,
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,wind_speed_10m_max",
      timezone: "auto",
      start_date: start,
      end_date: end,
    },
  });

  const d = data.daily;
  return d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    rain: d.precipitation_sum[i] ?? 0,
    rainChance: d.precipitation_probability_max[i] ?? 0,
    uv: d.uv_index_max[i] ?? 0,
    wind: Math.round(d.wind_speed_10m_max[i] ?? 0),
  }));
}

// ---------- analysis ----------
function summarize(days) {
  const n = days.length;
  const avgMax = Math.round(days.reduce((s, d) => s + d.max, 0) / n);
  const avgMin = Math.round(days.reduce((s, d) => s + d.min, 0) / n);
  const rainyDays = days.filter((d) => d.rainChance >= 50).length;
  const maxUv = Math.max(...days.map((d) => d.uv));
  const maxWind = Math.max(...days.map((d) => d.wind));
  const hottest = days.reduce((a, b) => (b.max > a.max ? b : a));
  const coldest = days.reduce((a, b) => (b.min < a.min ? b : a));

  const scored = days.map((d) => ({
    d,
    score: d.rainChance + Math.abs(d.max - 26) * 2 + (d.uv >= 8 ? 10 : 0) + (d.wind >= 30 ? 10 : 0),
  }));
  scored.sort((a, b) => a.score - b.score);

  return {
    avgMax,
    avgMin,
    rainyDays,
    maxUv,
    maxWind,
    hottest,
    coldest,
    best: scored[0].d,
    worst: scored[scored.length - 1].d,
  };
}

function buildPacking(s) {
  const list = ["🪪 ID and tickets", "📱 Phone and charger", "💊 Basic medicines"];

  // clothes by temperature
  if (s.avgMax >= 33) {
    list.push("👕 Light cotton clothes", "🧢 Cap or hat", "🕶️ Sunglasses", "💧 Water bottle");
  } else if (s.avgMax >= 24) {
    list.push("👕 T-shirts and light trousers", "🕶️ Sunglasses");
  } else if (s.avgMax >= 14) {
    list.push("🧥 Light jacket", "👖 Full-length trousers", "🧦 Socks");
  } else {
    list.push("🧥 Heavy winter jacket", "🧣 Scarf, gloves and woolen cap", "👢 Warm shoes", "🧦 Thermal wear");
  }

  if (s.avgMax - s.avgMin >= 10) list.push("🧥 Extra layer for cool mornings and nights");
  if (s.avgMin <= 5) list.push("🧤 Gloves and thermals for freezing nights");

  // rain
  if (s.rainyDays >= 1) list.push("☂️ Umbrella", "👟 Waterproof shoes or sandals");
  if (s.rainyDays >= Math.ceil(s.rainyDays > 0 ? 3 : 99)) list.push("🧥 Raincoat", "🎒 Waterproof bag cover");

  // sun
  if (s.maxUv >= 6) list.push("🧴 Sunscreen (SPF 30+)");

  // wind
  if (s.maxWind >= 30) list.push("🧥 Windcheater jacket");

  return list;
}

// ---------- page ----------
export default function TravelPlanner() {
  const today = new Date();
  const minDate = toDateStr(today);
  const maxDate = toDateStr(addDays(today, MAX_AHEAD_DAYS));

  const [city, setCity] = useState(null);
  const [start, setStart] = useState(minDate);
  const [end, setEnd] = useState(toDateStr(addDays(today, 2)));

  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});

  // load forecast when destination or dates change
  useEffect(() => {
    if (!city) return;

    if (end < start) {
      setError("End date must be on or after the start date.");
      setDays([]);
      return;
    }
    if (tripDays(start, end) > MAX_TRIP_DAYS) {
      setError(`Please choose a trip of ${MAX_TRIP_DAYS} days or less.`);
      setDays([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadTrip(city.latitude, city.longitude, start, end);
        if (!cancelled) {
          setDays(result);
          setChecked({});
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the forecast. Check your internet and dates.");
          setDays([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city, start, end]);

  function changeStart(value) {
    setStart(value);
    if (value && end < value) setEnd(value);
  }

  const summary = days.length > 0 ? summarize(days) : null;
  const packing = summary ? buildPacking(summary) : [];
  const doneCount = packing.filter((p) => checked[p]).length;

  const chartData = days.map((d) => ({
    day: prettyDate(d.date),
    High: d.max,
    Low: d.min,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Travel planner</h2>
        <p className="text-sm text-slate-500 mb-3">
          Pick a destination and your dates to see the forecast and what to pack.
        </p>

        <SearchBar onSelect={setCity} placeholder="Where are you going?" />

        {city && (
          <p className="mt-2 inline-flex items-center gap-1 text-sm bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">
            <MapPin size={14} />
            {[city.name, city.admin1, city.country].filter(Boolean).join(", ")}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 max-w-md">
          <label className="text-xs text-slate-500">
            Start date
            <input
              type="date"
              value={start}
              min={minDate}
              max={maxDate}
              onChange={(e) => changeStart(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
          <label className="text-xs text-slate-500">
            End date
            <input
              type="date"
              value={end}
              min={start || minDate}
              max={maxDate}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Forecasts are available up to {MAX_AHEAD_DAYS} days from today.
        </p>
      </div>

      {!city && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          Search for a destination to plan your trip.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && <p className="text-slate-500">Loading trip forecast...</p>}

      {!loading && summary && (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <CalendarDays size={14} /> Trip length
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {days.length} day{days.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500">Average temperature</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {summary.avgMax}° / {summary.avgMin}°
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Droplets size={14} /> Rainy days
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {summary.rainyDays} of {days.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500">Max UV index</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{summary.maxUv}</p>
            </div>
          </div>

          {/* best day */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-slate-700 flex items-start gap-2">
            <Star size={18} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p>
                <b>Best day for sightseeing:</b> {prettyDate(summary.best.date)}
                {" "}({getWeatherInfo(summary.best.code).icon} {summary.best.max}°C, rain chance{" "}
                {summary.best.rainChance}%)
              </p>
              {days.length > 1 && summary.worst.date !== summary.best.date && (
                <p className="text-slate-500 mt-1">
                  Toughest day: {prettyDate(summary.worst.date)}. Keep indoor plans ready.
                </p>
              )}
            </div>
          </div>

          {/* day by day */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Day by day</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {days.map((d) => {
                const info = getWeatherInfo(d.code);
                const isBest = d.date === summary.best.date;
                return (
                  <div
                    key={d.date}
                    className={`rounded-2xl border p-4 text-center ${
                      isBest ? "bg-green-50 border-green-300" : "bg-white border-slate-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-700">{prettyDate(d.date)}</p>
                    <p className="text-4xl my-2">{info.icon}</p>
                    <p className="text-xs text-slate-500 h-8">{info.label}</p>
                    <p className="mt-1 font-bold text-slate-800">
                      {d.max}° <span className="font-normal text-slate-400">{d.min}°</span>
                    </p>
                    <p className="mt-1 flex items-center justify-center gap-1 text-xs text-sky-600">
                      <Droplets size={12} />
                      {d.rainChance}%
                    </p>
                    {isBest && (
                      <p className="mt-2 text-[11px] font-medium text-green-700">⭐ Best day</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* chart */}
          {days.length > 1 && (
            <section className="bg-white border border-slate-200 rounded-2xl p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Temperature trend (°C)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={["dataMin - 2", "dataMax + 2"]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="High" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Low" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* packing list */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-800">Packing checklist</h3>
              <span className="text-sm text-slate-500">
                {doneCount}/{packing.length} packed
              </span>
            </div>

            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-sky-500 transition-all"
                style={{ width: `${(doneCount / packing.length) * 100}%` }}
              />
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {packing.map((item) => {
                const done = !!checked[item];
                return (
                  <li key={item}>
                    <button
                      onClick={() => setChecked((c) => ({ ...c, [item]: !c[item] }))}
                      className="w-full flex items-center gap-3 text-left text-sm rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                    >
                      {done ? (
                        <CheckSquare size={18} className="text-sky-600 shrink-0" />
                      ) : (
                        <Square size={18} className="text-slate-400 shrink-0" />
                      )}
                      <span className={done ? "line-through text-slate-400" : "text-slate-700"}>
                        {item}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}