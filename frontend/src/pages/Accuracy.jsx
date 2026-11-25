import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardPlus,
  RefreshCw,
  Target,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import SearchBar from "../components/SearchBar";
import {
  captureAccuracySnapshots,
  formatHour,
  getAccuracyMetrics,
  recordAccuracyObservation,
} from "../services/api";

const DEFAULT_CITY = {
  id: 1258980,
  name: "Ranchi",
  admin1: "Jharkhand",
  country: "India",
  latitude: 23.3441,
  longitude: 85.3096,
};

function currentHourInput() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:00`;
}

function scoreInfo(score) {
  if (score == null) return { label: "N/A", color: "text-slate-500" };
  if (score >= 85) return { label: "Excellent", color: "text-green-600" };
  if (score >= 70) return { label: "Good", color: "text-sky-600" };
  if (score >= 50) return { label: "Fair", color: "text-yellow-600" };
  return { label: "Poor", color: "text-red-600" };
}

export default function Accuracy() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Capture / Observation form state
  const [capturing, setCapturing] = useState(false);
  const [obsTemp, setObsTemp] = useState("");
  const [obsPrecip, setObsPrecip] = useState("");
  const [obsWind, setObsWind] = useState("");
  const [obsTime, setObsTime] = useState(currentHourInput);
  const [recordingObs, setRecordingObs] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);

  const loadMetrics = useCallback(() => {
    setReloadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchMetrics() {
      setLoading(true);
      setError("");
      try {
        const data = await getAccuracyMetrics({
          latitude: city.latitude,
          longitude: city.longitude,
        });
        if (!cancelled) setMetrics(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load accuracy metrics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchMetrics();
    return () => {
      cancelled = true;
    };
  }, [city, reloadTick]);

  async function handleCaptureSnapshots() {
    setCapturing(true);
    setError("");
    setNotice("");
    try {
      const res = await captureAccuracySnapshots({
        latitude: city.latitude,
        longitude: city.longitude,
        location_name: city.display_name || city.name,
        hours: 24,
      });
      setNotice(
        `Captured ${res.saved_count} hourly forecast snapshot(s) for ${city.name}.`
      );
      await loadMetrics();
    } catch (err) {
      setError(err.message);
    } finally {
      setCapturing(false);
    }
  }

  async function handleRecordObservation(e) {
    e.preventDefault();
    if (obsTemp === "") return;
    setRecordingObs(true);
    setError("");
    setNotice("");
    try {
      await recordAccuracyObservation({
        latitude: city.latitude,
        longitude: city.longitude,
        observed_at: obsTime,
        observed_temp: Number(obsTemp),
        observed_precip_mm: obsPrecip === "" ? null : Number(obsPrecip),
        observed_wind_kmh: obsWind === "" ? null : Number(obsWind),
      });
      setNotice(`Recorded observation for ${city.name} at ${obsTime}.`);
      setObsTemp("");
      setObsPrecip("");
      setObsWind("");
      await loadMetrics();
    } catch (err) {
      setError(err.message);
    } finally {
      setRecordingObs(false);
    }
  }

  const comparisons = metrics?.comparisons || [];
  const chartData = [...comparisons]
    .reverse()
    .map((c) => ({
      time: `${c.valid_time.slice(5, 10)} ${formatHour(c.valid_time)}`,
      Predicted: c.predicted_temp,
      Observed: c.observed_temp,
      Error: Number((c.predicted_temp - c.observed_temp).toFixed(2)),
    }));

  const info = scoreInfo(metrics?.reliability_score);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Forecast accuracy tracker</h2>
        <p className="text-sm text-slate-500 mb-3">
          Auditable snapshot vs observation accuracy metrics for{" "}
          <b className="text-slate-700">{city.name}</b>.
        </p>
        <div className="flex gap-2">
          <SearchBar
            onSelect={setCity}
            placeholder="Check accuracy for another city..."
          />
          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium px-3 rounded-xl"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
          {notice}
        </div>
      )}

      {/* Actions: Capture Forecast Snapshots & Record Observation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Camera size={18} className="text-sky-600" />
            1. Capture Forecast Snapshots
          </h3>
          <p className="text-xs text-slate-500">
            Save the next 24 hours of live Open-Meteo predictions for {city.name} into
            the database so they can be compared against real observations later.
          </p>
          <button
            type="button"
            onClick={handleCaptureSnapshots}
            disabled={capturing}
            className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {capturing ? "Capturing..." : "Capture 24h Live Snapshot"}
          </button>
        </section>

        <form
          onSubmit={handleRecordObservation}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
        >
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardPlus size={18} className="text-sky-600" />
            2. Record Actual Observation
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="number"
              step="0.1"
              required
              value={obsTemp}
              onChange={(e) => setObsTemp(e.target.value)}
              placeholder="Observed temp (°C)"
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
            <input
              type="datetime-local"
              required
              value={obsTime}
              onChange={(e) => setObsTime(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
            <input
              type="number"
              step="0.1"
              min="0"
              value={obsPrecip}
              onChange={(e) => setObsPrecip(e.target.value)}
              placeholder="Rain mm (optional)"
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
            <input
              type="number"
              step="0.1"
              min="0"
              value={obsWind}
              onChange={(e) => setObsWind(e.target.value)}
              placeholder="Wind km/h (optional)"
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <button
            type="submit"
            disabled={recordingObs || obsTemp === ""}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {recordingObs ? "Saving..." : "Save Observation"}
          </button>
        </form>
      </div>

      {loading && <p className="text-slate-500">Loading accuracy metrics...</p>}

      {!loading && metrics && (
        <>
          {metrics.status === "insufficient_data" && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
              <p className="font-semibold">
                Insufficient data ({metrics.sample_count}/
                {metrics.minimum_sample_threshold} matched records)
              </p>
              <p className="text-xs text-amber-800 mt-1">{metrics.message}</p>
            </div>
          )}

          {metrics.status === "available" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Target size={18} className="text-sky-600" />
                  Reliability score
                </div>
                <p className={`text-4xl font-bold mt-2 ${info.color}`}>
                  {metrics.reliability_score}%
                </p>
                <p className={`text-sm font-medium ${info.color}`}>
                  {info.label} ({metrics.sample_count} matched samples)
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <TrendingDown size={18} className="text-sky-600" />
                  Temperature MAE
                </div>
                <p className="text-4xl font-bold mt-2 text-slate-800">
                  {metrics.temperature_mae}°C
                </p>
                <p className="text-sm text-slate-500">
                  Precip MAE:{" "}
                  {metrics.precipitation_mae != null
                    ? `${metrics.precipitation_mae} mm`
                    : "N/A"}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <CheckCircle2 size={18} className="text-sky-600" />
                  Within ±2°C
                </div>
                <p className="text-4xl font-bold mt-2 text-slate-800">
                  {metrics.within_2c_percent}%
                </p>
                <p className="text-sm text-slate-500">of matched records</p>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <>
              <section className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-3">
                  Predicted vs Observed Temperature (°C)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        domain={["dataMin - 2", "dataMax + 2"]}
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="Predicted"
                        stroke="#f97316"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Observed"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-1">
                  Temperature Bias (°C)
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  Predicted minus observed temperature per matched hour.
                </p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <ReferenceLine y={0} stroke="#64748b" />
                      <Bar dataKey="Error" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}

          {comparisons.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 font-semibold">Valid time</th>
                    <th className="px-4 py-3 font-semibold">Predicted</th>
                    <th className="px-4 py-3 font-semibold">Observed</th>
                    <th className="px-4 py-3 font-semibold">Abs error</th>
                    <th className="px-4 py-3 font-semibold">Horizon</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                        {c.valid_time}
                      </td>
                      <td className="px-4 py-3">{c.predicted_temp}°C</td>
                      <td className="px-4 py-3">{c.observed_temp}°C</td>
                      <td className="px-4 py-3 font-medium">
                        {c.temperature_abs_error}°C
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {c.horizon_hours != null ? `${c.horizon_hours}h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Formula: {metrics.reliability_formula} (location key:{" "}
            {metrics.location_key || "all"}).
          </p>
        </>
      )}
    </div>
  );
}
