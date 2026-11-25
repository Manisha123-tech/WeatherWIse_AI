import { useState } from "react";
import { X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import SearchBar from "../components/SearchBar";
import { useAuth } from "../context/useAuth";
import {
  compareLocations,
  convertTemp,
  convertWind,
  formatDay,
  getWeather,
  getWeatherInfo,
  tempSymbol,
  windSymbol,
} from "../services/api";

const MAX_CITIES = 5;
const COLORS = ["#0284c7", "#f97316", "#16a34a", "#9333ea", "#e11d48"];

const keyOf = (c) => `${Number(c.latitude).toFixed(4)}-${Number(c.longitude).toFixed(4)}`;

export default function Comparison() {
  const { preferences } = useAuth();
  const tUnit = preferences.temperature_unit;
  const wUnit = preferences.wind_speed_unit;
  const tSym = tempSymbol(tUnit);
  const wSym = windSymbol(wUnit);

  const [selectedCities, setSelectedCities] = useState([]);
  const [entries, setEntries] = useState([]); // normalized entries from backend
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshComparison(nextCities) {
    setSelectedCities(nextCities);
    setError("");
    setFailed([]);

    if (nextCities.length === 0) {
      setEntries([]);
      setSummary(null);
      return;
    }

    setLoading(true);
    try {
      if (nextCities.length === 1) {
        const c = nextCities[0];
        const w = await getWeather(c.latitude, c.longitude);
        const today = w.daily[0] || {};
        setEntries([
          {
            city: c,
            temperature: w.current.temp,
            feels_like: w.current.feelsLike,
            humidity: w.current.humidity,
            wind_speed: w.current.wind,
            rain_probability_today_max: today.rainChance ?? 0,
            precipitation_today: today.rain ?? 0,
            temp_max: today.max,
            temp_min: today.min,
            condition: w.current.condition,
            weather_code: w.current.code,
            is_day: w.current.isDay,
            daily: w.daily.map((d) => ({
              date: d.date,
              temp_max: d.max,
              temp_min: d.min,
            })),
          },
        ]);
        setSummary(null);
      } else {
        const result = await compareLocations(
          nextCities.map((c) => ({
            latitude: c.latitude,
            longitude: c.longitude,
          }))
        );
        const mapped = (result.cities || []).map((entry, idx) => {
          const matchedCity = nextCities[idx] || entry.location;
          return {
            ...entry,
            city: {
              ...matchedCity,
              name: matchedCity.name || entry.location?.name || `City ${idx + 1}`,
              country: matchedCity.country || entry.location?.country || "",
            },
          };
        });
        setEntries(mapped);
        setSummary(result.summary || null);
        setFailed(result.failed || []);
      }
    } catch (err) {
      setError(err.message || "Could not compare cities.");
    } finally {
      setLoading(false);
    }
  }

  async function addCity(city) {
    setError("");
    if (selectedCities.length >= MAX_CITIES) {
      setError(`You can compare up to ${MAX_CITIES} cities. Remove one first.`);
      return;
    }
    if (selectedCities.some((c) => keyOf(c) === keyOf(city))) {
      setError(`${city.name} is already added.`);
      return;
    }
    await refreshComparison([...selectedCities, city]);
  }

  async function removeCity(city) {
    const next = selectedCities.filter((c) => keyOf(c) !== keyOf(city));
    await refreshComparison(next);
  }

  const todayData = entries.map((e) => ({
    name: e.city.name,
    Now: convertTemp(e.temperature, tUnit),
    High: convertTemp(e.temp_max, tUnit),
    Low: convertTemp(e.temp_min, tUnit),
  }));

  const weekData =
    entries.length > 0 && entries[0].daily?.length
      ? entries[0].daily.map((d, i) => {
          const row = { day: i === 0 ? "Today" : formatDay(d.date) };
          entries.forEach((e) => {
            row[e.city.name] = convertTemp(e.daily[i]?.temp_max, tUnit);
          });
          return row;
        })
      : [];

  const rows = [
    {
      label: "Condition",
      get: (e) => {
        if (e.weather_code != null) {
          const info = getWeatherInfo(e.weather_code, e.is_day);
          return `${info.icon} ${e.condition || info.label}`;
        }
        return e.condition || "—";
      },
    },
    { label: "Temperature", get: (e) => `${convertTemp(e.temperature, tUnit) ?? "—"}${tSym}` },
    { label: "Feels like", get: (e) => `${convertTemp(e.feels_like, tUnit) ?? "—"}${tSym}` },
    {
      label: "Today high / low",
      get: (e) =>
        `${convertTemp(e.temp_max, tUnit) ?? "—"}° / ${convertTemp(e.temp_min, tUnit) ?? "—"}°`,
    },
    { label: "Humidity", get: (e) => (e.humidity != null ? `${e.humidity}%` : "—") },
    {
      label: "Wind",
      get: (e) =>
        e.wind_speed != null ? `${convertWind(e.wind_speed, wUnit)} ${wSym}` : "—",
    },
    {
      label: "Rain chance",
      get: (e) => `${e.rain_probability_today_max ?? 0}%`,
    },
    {
      label: "Precipitation",
      get: (e) => `${e.precipitation_today ?? 0} mm`,
    },
  ];

  function displaySummaryName(extreme) {
    if (!extreme) return null;
    // backend uses display_name or lat, lon; match to selected city name if possible
    const match = entries.find(
      (e) =>
        extreme.city?.includes(String(e.location?.latitude)) ||
        extreme.city === e.location?.display_name ||
        extreme.city === e.location?.name
    );
    return match ? match.city.name : extreme.city;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Compare cities</h2>
        <p className="text-sm text-slate-500 mb-3">
          Add up to {MAX_CITIES} cities to compare their weather side by side via the backend.
        </p>
        <SearchBar onSelect={addCity} placeholder="Add a city to compare..." />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {failed.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Some locations could not be loaded:{" "}
          {failed.map((f) => `${f.query} (${f.error?.message})`).join(", ")}
        </div>
      )}

      {loading && <p className="text-slate-500">Comparing cities...</p>}

      {selectedCities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCities.map((city, i) => (
            <span
              key={keyOf(city)}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-3 pr-2 py-1 text-sm"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
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

      {selectedCities.length === 0 && !loading && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          Search and add at least 2 cities to start comparing.
        </div>
      )}

      {selectedCities.length === 1 && !loading && (
        <p className="text-sm text-slate-500">Add one more city to compare.</p>
      )}

      {summary && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
          {summary.hottest && (
            <span>
              🔥 Hottest: <b>{displaySummaryName(summary.hottest)}</b> (
              {convertTemp(summary.hottest.value, tUnit)}
              {tSym})
            </span>
          )}
          {summary.coolest && (
            <span>
              ❄️ Coolest: <b>{displaySummaryName(summary.coolest)}</b> (
              {convertTemp(summary.coolest.value, tUnit)}
              {tSym})
            </span>
          )}
          {summary.most_humid && (
            <span>
              💧 Most humid: <b>{displaySummaryName(summary.most_humid)}</b> (
              {summary.most_humid.value}%)
            </span>
          )}
          {summary.windiest && (
            <span>
              💨 Windiest: <b>{displaySummaryName(summary.windiest)}</b> (
              {convertWind(summary.windiest.value, wUnit)} {wSym})
            </span>
          )}
          {summary.highest_rain_chance && (
            <span>
              ☔ Rainiest: <b>{displaySummaryName(summary.highest_rain_chance)}</b> (
              {summary.highest_rain_chance.value}%)
            </span>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600"></th>
                  {entries.map((e) => (
                    <th key={keyOf(e.city)} className="px-4 py-3 font-semibold text-slate-800">
                      {e.city.name}
                      <span className="block text-xs font-normal text-slate-500">
                        {e.city.country}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{row.label}</td>
                    {entries.map((e) => (
                      <td key={keyOf(e.city)} className="px-4 py-3 text-slate-800 whitespace-nowrap">
                        {row.get(e)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Today&apos;s temperature ({tSym})
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

          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              7-day high temperature ({tSym})
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {entries.map((e, i) => (
                    <Line
                      key={keyOf(e.city)}
                      type="monotone"
                      dataKey={e.city.name}
                      stroke={COLORS[i % COLORS.length]}
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
