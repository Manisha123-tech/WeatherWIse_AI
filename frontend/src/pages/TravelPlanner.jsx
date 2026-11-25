import { useState } from "react";
import {
  AlertTriangle,
  Clock,
  Droplets,
  Info,
  MapPin,
  Navigation,
  Wind,
  X,
} from "lucide-react";

import SearchBar from "../components/SearchBar";
import { useAuth } from "../context/useAuth";
import {
  analyzeTravel,
  convertTemp,
  convertWind,
  getWeatherInfo,
  tempSymbol,
  windSymbol,
} from "../services/api";

function defaultDepartureInput() {
  const d = new Date(Date.now() + 3600 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:00`;
}

export default function TravelPlanner() {
  const { preferences } = useAuth();
  const tUnit = preferences.temperature_unit;
  const wUnit = preferences.wind_speed_unit;
  const tSym = tempSymbol(tUnit);
  const wSym = windSymbol(wUnit);

  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [departureTime, setDepartureTime] = useState(defaultDepartureInput);
  const [durationHours, setDurationHours] = useState("3");

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addWaypoint(city) {
    if (waypoints.length >= 3) return;
    setWaypoints((prev) => [...prev, city]);
  }

  function removeWaypoint(idx) {
    setWaypoints((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAnalyze(e) {
    e.preventDefault();
    setError("");
    if (!origin || !destination) {
      setError("Please select both an origin and a destination city.");
      return;
    }

    setLoading(true);
    try {
      const result = await analyzeTravel({
        origin: {
          latitude: origin.latitude,
          longitude: origin.longitude,
        },
        destination: {
          latitude: destination.latitude,
          longitude: destination.longitude,
        },
        waypoints: waypoints.map((wp) => ({
          latitude: wp.latitude,
          longitude: wp.longitude,
        })),
        departure_time: departureTime,
        estimated_duration_hours: Number(durationHours) || 3,
      });
      setAnalysis(result);
    } catch (err) {
      setError(err.message || "Could not analyze travel weather.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  function checkpointDisplayName(cp, idx) {
    if (cp.role === "origin" && origin) return origin.name;
    if (cp.role === "destination" && destination) return destination.name;
    if (cp.role?.startsWith("waypoint_")) {
      const wpIdx = Number(cp.role.split("_")[1]) - 1;
      if (waypoints[wpIdx]) return waypoints[wpIdx].name;
    }
    return cp.location?.display_name || cp.location?.name || `Checkpoint ${idx + 1}`;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Weather-based travel planner</h2>
        <p className="text-sm text-slate-500">
          Analyze forecast conditions across your origin, optional waypoints, and
          destination at estimated arrival times.
        </p>
      </div>

      <form
        onSubmit={handleAnalyze}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Origin
            </label>
            <SearchBar onSelect={setOrigin} placeholder="Search starting city..." />
            {origin && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">
                <MapPin size={12} />
                {[origin.name, origin.country].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Destination
            </label>
            <SearchBar
              onSelect={setDestination}
              placeholder="Search destination city..."
            />
            {destination && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">
                <MapPin size={12} />
                {[destination.name, destination.country].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Waypoints */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Optional waypoints ({waypoints.length}/3)
          </label>
          {waypoints.length < 3 && (
            <SearchBar
              onSelect={addWaypoint}
              placeholder="Add a stop along the way (optional)..."
            />
          )}
          {waypoints.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {waypoints.map((wp, idx) => (
                <span
                  key={`${wp.latitude}-${wp.longitude}-${idx}`}
                  className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 rounded-full pl-3 pr-2 py-1"
                >
                  Stop {idx + 1}: {wp.name}
                  <button
                    type="button"
                    onClick={() => removeWaypoint(idx)}
                    className="hover:text-red-600"
                    aria-label="Remove waypoint"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <label className="text-xs text-slate-500">
            Departure date & time
            <input
              type="datetime-local"
              required
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
          <label className="text-xs text-slate-500">
            Estimated duration (hours)
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="72"
              required
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50"
        >
          <Navigation size={16} />
          {loading ? "Analyzing route weather..." : "Analyze travel weather"}
        </button>
      </form>

      {analysis && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={14} /> Schedule
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-1">
                {analysis.departure_time.replace("T", " ")} →{" "}
                {analysis.estimated_arrival_time.replace("T", " ")}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500">Temperature range</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {convertTemp(analysis.summary.temperature_min, tUnit) ?? "—"}° –{" "}
                {convertTemp(analysis.summary.temperature_max, tUnit) ?? "—"}
                {tSym}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Droplets size={14} /> Peak rain chance
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {analysis.summary.rain_probability_max ?? 0}%
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Wind size={14} /> Max wind speed
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {convertWind(analysis.summary.wind_speed_max, wUnit) ?? "—"} {wSym}
              </p>
            </div>
          </div>

          {/* Suggestions */}
          {analysis.suggestions?.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle size={16} /> Travel Guidance
              </p>
              <ul className="text-sm text-amber-800 space-y-1 list-disc pl-5">
                {analysis.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Checkpoints */}
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">
              Checkpoint Forecasts ({analysis.data_coverage.checkpoints_with_forecast}/
              {analysis.data_coverage.checkpoints_requested} covered)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {analysis.checkpoints.map((cp, idx) => {
                const cond = cp.conditions;
                const info = cond ? getWeatherInfo(cond.weather_code) : null;
                return (
                  <div
                    key={`${cp.role}-${idx}`}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide font-semibold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full">
                        {cp.role.replace("_", " ")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {cp.target_time.replace("T", " ")}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800">
                      {checkpointDisplayName(cp, idx)}
                    </p>
                    {cp.forecast_available && cond ? (
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-2xl font-bold text-slate-800">
                            {info?.icon} {convertTemp(cond.temperature, tUnit)}
                            {tSym}
                          </p>
                          <p className="text-xs text-slate-500">
                            {cond.condition || info?.label}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-600 space-y-0.5">
                          <p>Rain: {cond.precipitation_probability ?? 0}%</p>
                          <p>
                            Wind: {convertWind(cond.wind_speed, wUnit)} {wSym}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Forecast unavailable for this time window.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <p className="text-xs text-slate-500 flex items-start gap-1.5 bg-white border border-slate-200 rounded-xl p-3">
            <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
            <span>{analysis.uncertainty_note}</span>
          </p>
        </>
      )}
    </div>
  );
}
