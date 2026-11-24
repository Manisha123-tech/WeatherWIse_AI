import { useState } from "react";
import { X } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import SearchBar from "../components/SearchBar";
import { getWeather, getWeatherInfo, formatDay } from "../services/api";

const MAX_CITIES = 4;
const COLORS = ["#0284c7", "#f97316", "#16a34a", "#9333ea"];

const keyOf = (c) => `${c.latitude}-${c.longitude}`;

export default function Comparison() {
  const [items, setItems] = useState([]); // [{ city, weather }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function addCity(city) {
    setError("");

    if (items.length >= MAX_CITIES) {
      setError(`You can compare up to ${MAX_CITIES} cities. Remove one first.`);
      return;
    }
    if (items.some((i) => keyOf(i.city) === keyOf(city))) {
      setError(`${city.name} is already added.`);
      return;
    }

    setLoading(true);
    try {
      const weather = await getWeather(city.latitude, city.longitude);
      setItems((prev) => [...prev, { city, weather }]);
    } catch {
      setError("Could not load that city. Check your internet.");
    } finally {
      setLoading(false);
    }
  }

  function removeCity(city) {
    setItems((prev) => prev.filter((i) => keyOf(i.city) !== keyOf(city)));
  }

  // chart 1: today's temperatures per city
  const todayData = items.map(({ city, weather }) => ({
    name: city.name,
    Now: weather.current.temp,
    High: weather.daily[0].max,
    Low: weather.daily[0].min,
  }));

  // chart 2: 7-day highs, one line per city
  const weekData =
    items.length > 0
      ? items[0].weather.daily.map((d, i) => {
          const row = { day: i === 0 ? "Today" : formatDay(d.date) };
          items.forEach(({ city, weather }) => {
            row[city.name] = weather.daily[i].max;
          });
          return row;
        })
      : [];

  // summary
  let hottest = null;
  let coolest = null;
  if (items.length >= 2) {
    hottest = items.reduce((a, b) =>
      b.weather.current.temp > a.weather.current.temp ? b : a
    );
    coolest = items.reduce((a, b) =>
      b.weather.current.temp < a.weather.current.temp ? b : a
    );
  }

  const rows = [
    { label: "Condition", get: (w) => {
        const info = getWeatherInfo(w.current.code, w.current.isDay);
        return `${info.icon} ${info.label}`;
      } },
    { label: "Temperature", get: (w) => `${w.current.temp}°C` },
    { label: "Feels like", get: (w) => `${w.current.feelsLike}°C` },
    { label: "Today high / low", get: (w) => `${w.daily[0].max}° / ${w.daily[0].min}°` },
    { label: "Humidity", get: (w) => `${w.current.humidity}%` },
    { label: "Wind", get: (w) => `${w.current.wind} km/h` },
    { label: "Pressure", get: (w) => `${w.current.pressure} hPa` },
    { label: "Rain chance", get: (w) => `${w.daily[0].rainChance ?? 0}%` },
    { label: "UV index", get: (w) => w.daily[0].uv },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Compare cities</h2>
        <p className="text-sm text-slate-500 mb-3">
          Add up to {MAX_CITIES} cities to compare their weather side by side.
        </p>
        <SearchBar onSelect={addCity} placeholder="Add a city to compare..." />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && <p className="text-slate-500">Adding city...</p>}

      {/* selected city chips */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map(({ city }, i) => (
            <span
              key={keyOf(city)}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-3 pr-2 py-1 text-sm"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i] }}
              />
              {city.name}
              <button
                onClick={() => removeCity(city)}
                className="p-0.5 rounded-full hover:bg-slate-100"
                aria-label={`Remove ${city.name}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          Search and add at least 2 cities to start comparing.
        </div>
      )}

      {items.length === 1 && (
        <p className="text-sm text-slate-500">Add one more city to compare.</p>
      )}

      {hottest && coolest && hottest !== coolest && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-slate-700">
          🔥 Hottest right now: <b>{hottest.city.name}</b> ({hottest.weather.current.temp}°C)
          &nbsp;·&nbsp; ❄️ Coolest: <b>{coolest.city.name}</b> ({coolest.weather.current.temp}°C)
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* comparison table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600"></th>
                  {items.map(({ city }) => (
                    <th key={keyOf(city)} className="px-4 py-3 font-semibold text-slate-800">
                      {city.name}
                      <span className="block text-xs font-normal text-slate-500">
                        {city.country}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{row.label}</td>
                    {items.map(({ city, weather }) => (
                      <td key={keyOf(city)} className="px-4 py-3 text-slate-800 whitespace-nowrap">
                        {row.get(weather)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* chart 1 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Today's temperature (°C)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={todayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Low" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Now" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="High" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* chart 2 */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              7-day high temperature (°C)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {items.map(({ city }, i) => (
                    <Line
                      key={keyOf(city)}
                      type="monotone"
                      dataKey={city.name}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}