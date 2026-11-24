import { useEffect, useState } from "react";
import axios from "axios";
import { Target, TrendingDown, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

import SearchBar from "../components/SearchBar";
import { formatDay } from "../services/api";

const DEFAULT_CITY = {
  id: 1258980,
  name: "Ranchi",
  admin1: "Jharkhand",
  country: "India",
  latitude: 23.3441,
  longitude: 85.3096,
};

const PREV_RUNS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast";

const round1 = (n) => Math.round(n * 10) / 10;

// fetch hourly "actual" and "forecast made 1 day before", then build daily rows
async function loadAccuracy(latitude, longitude) {
  const { data } = await axios.get(PREV_RUNS_URL, {
    params: {
      latitude,
      longitude,
      hourly: "temperature_2m,temperature_2m_previous_day1",
      past_days: 7,
      forecast_days: 1,
      timezone: "auto",
    },
  });

  const times = data.hourly.time;
  const actual = data.hourly.temperature_2m;
  const forecast = data.hourly.temperature_2m_previous_day1;

  // group hours by date
  const byDate = {};
  times.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (actual[i] == null || forecast[i] == null) return;
    if (!byDate[date]) byDate[date] = { a: [], f: [] };
    byDate[date].a.push(actual[i]);
    byDate[date].f.push(forecast[i]);
  });

  const lastDate = times[times.length - 1].slice(0, 10); // today (incomplete)

  const days = Object.entries(byDate)
    .filter(([date, v]) => date !== lastDate && v.a.length >= 20)
    .map(([date, v]) => {
      const actMax = Math.max(...v.a);
      const actMin = Math.min(...v.a);
      const fcMax = Math.max(...v.f);
      const fcMin = Math.min(...v.f);
      const hourlyErr =
        v.a.reduce((sum, val, i) => sum + Math.abs(val - v.f[i]), 0) / v.a.length;

      return {
        date,
        label: formatDay(date),
        actMax: round1(actMax),
        fcMax: round1(fcMax),
        actMin: round1(actMin),
        fcMin: round1(fcMin),
        errMax: round1(fcMax - actMax),
        errMin: round1(fcMin - actMin),
        hourlyErr: round1(hourlyErr),
      };
    });

  return days;
}

function scoreInfo(score) {
  if (score >= 85) return { label: "Excellent", color: "text-green-600" };
  if (score >= 70) return { label: "Good", color: "text-sky-600" };
  if (score >= 50) return { label: "Fair", color: "text-yellow-600" };
  return { label: "Poor", color: "text-red-600" };
}

function ErrorCell({ value }) {
  const abs = Math.abs(value);
  const color =
    abs <= 1 ? "text-green-600" : abs <= 2 ? "text-yellow-600" : "text-red-600";
  return (
    <span className={`font-medium ${color}`}>
      {value > 0 ? "+" : ""}
      {value}°
    </span>
  );
}

export default function Accuracy() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadAccuracy(city.latitude, city.longitude);
        if (!cancelled) setDays(result);
      } catch {
        if (!cancelled) setError("Could not load accuracy data. Check your internet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city]);

  // summary numbers
  let mae = 0;
  let within2 = 0;
  let score = 0;
  if (days.length > 0) {
    const errors = days.flatMap((d) => [Math.abs(d.errMax), Math.abs(d.errMin)]);
    mae = round1(errors.reduce((a, b) => a + b, 0) / errors.length);
    within2 = Math.round((errors.filter((e) => e <= 2).length / errors.length) * 100);
    score = Math.max(0, Math.round(100 - mae * 15));
  }
  const info = scoreInfo(score);

  const errorChart = days.map((d) => ({
    label: d.label,
    "High error": d.errMax,
    "Low error": d.errMin,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Forecast accuracy</h2>
        <p className="text-sm text-slate-500 mb-3">
          How close were yesterday's forecasts to what really happened in{" "}
          <b className="text-slate-700">{city.name}</b>?
        </p>
        <SearchBar onSelect={setCity} placeholder="Check accuracy for another city..." />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && <p className="text-slate-500">Calculating accuracy...</p>}

      {!loading && !error && days.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          Not enough past data for this location.
        </div>
      )}

      {!loading && days.length > 0 && (
        <>
          {/* score cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Target size={18} className="text-sky-600" />
                Accuracy score
              </div>
              <p className={`text-4xl font-bold mt-2 ${info.color}`}>{score}%</p>
              <p className={`text-sm font-medium ${info.color}`}>{info.label}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <TrendingDown size={18} className="text-sky-600" />
                Average error
              </div>
              <p className="text-4xl font-bold mt-2 text-slate-800">{mae}°C</p>
              <p className="text-sm text-slate-500">per day (high and low)</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <CheckCircle2 size={18} className="text-sky-600" />
                Within ±2°C
              </div>
              <p className="text-4xl font-bold mt-2 text-slate-800">{within2}%</p>
              <p className="text-sm text-slate-500">of predictions</p>
            </div>
          </div>

          {/* chart 1: forecast vs actual high */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Forecast vs actual: daily high (°C)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fcMax"
                    name="Forecast"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actMax"
                    name="Actual"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* chart 2: forecast vs actual low */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Forecast vs actual: daily low (°C)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fcMin"
                    name="Forecast"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actMin"
                    name="Actual"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* chart 3: error bars */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              Forecast error (°C)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Above 0 means the forecast was too warm. Below 0 means it was too cold.
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Bar dataKey="High error" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Low error" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Forecast high</th>
                  <th className="px-4 py-3 font-semibold">Actual high</th>
                  <th className="px-4 py-3 font-semibold">Error</th>
                  <th className="px-4 py-3 font-semibold">Forecast low</th>
                  <th className="px-4 py-3 font-semibold">Actual low</th>
                  <th className="px-4 py-3 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                      {d.label}, {d.date.slice(5)}
                    </td>
                    <td className="px-4 py-3">{d.fcMax}°</td>
                    <td className="px-4 py-3">{d.actMax}°</td>
                    <td className="px-4 py-3">
                      <ErrorCell value={d.errMax} />
                    </td>
                    <td className="px-4 py-3">{d.fcMin}°</td>
                    <td className="px-4 py-3">{d.actMin}°</td>
                    <td className="px-4 py-3">
                      <ErrorCell value={d.errMin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Score = 100 − (average error × 15), minimum 0. "Forecast" is the prediction made
            one day earlier. "Actual" is the best available measurement for that day. Data from
            Open-Meteo.
          </p>
        </>
      )}
    </div>
  );
}