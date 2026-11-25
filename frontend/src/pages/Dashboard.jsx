import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CloudRain,
  LocateFixed,
  RefreshCw,
  ShieldAlert,
  Shirt,
  Users,
} from "lucide-react";

import SearchBar from "../components/SearchBar";
import WeatherCard from "../components/WeatherCard";
import ForecastCard from "../components/ForecastCard";
import { useAuth } from "../context/useAuth";
import {
  convertTemp,
  formatHour,
  getAirQuality,
  getAlerts,
  getClothingAdvice,
  getRainEstimate,
  getUserLocation,
  getWeather,
  getWeatherInfo,
  tempSymbol,
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
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const { user, preferences, savedLocations, saveLocation, removeLocation } = useAuth();

  const [city, setCity] = useState(
    () => routerLocation.state?.city || DEFAULT_CITY
  );
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [rainEst, setRainEst] = useState(null);
  const [clothing, setClothing] = useState(null);
  const [alerts, setAlerts] = useState(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = refreshTick > 0;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const w = await getWeather(city.latitude, city.longitude, {
          refresh: forceRefresh,
        });
        if (cancelled) return;
        setWeather(w);

        const [aqRes, rainRes, clothRes, alertsRes] = await Promise.allSettled([
          getAirQuality(city.latitude, city.longitude, { refresh: forceRefresh }),
          getRainEstimate(city.latitude, city.longitude, 24),
          getClothingAdvice({
            latitude: city.latitude,
            longitude: city.longitude,
            hours: 12,
            comfort_preference: preferences.comfort_preference,
            temperature_unit: preferences.temperature_unit,
          }),
          getAlerts(city.latitude, city.longitude, city.name),
        ]);

        if (!cancelled) {
          setAir(aqRes.status === "fulfilled" ? aqRes.value : null);
          setRainEst(rainRes.status === "fulfilled" ? rainRes.value : null);
          setClothing(clothRes.status === "fulfilled" ? clothRes.value : null);
          setAlerts(alertsRes.status === "fulfilled" ? alertsRes.value : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load weather from backend.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city, refreshTick, preferences.comfort_preference, preferences.temperature_unit]);

  async function useMyLocation() {
    try {
      const loc = await getUserLocation();
      setCity(loc);
    } catch {
      setError("Location permission denied.");
    }
  }

  const savedMatch = savedLocations.find(
    (s) =>
      Math.abs(s.latitude - city.latitude) < 0.02 &&
      Math.abs(s.longitude - city.longitude) < 0.02
  );

  async function handleToggleSave() {
    if (!user) {
      navigate("/account");
      return;
    }
    try {
      if (savedMatch) {
        await removeLocation(savedMatch.id);
      } else {
        await saveLocation(city);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const tSym = tempSymbol(preferences.temperature_unit);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* search row */}
      <div className="flex gap-2 sm:gap-3">
        <SearchBar onSelect={setCity} />
        <button
          onClick={useMyLocation}
          className="shrink-0 flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 rounded-xl"
        >
          <LocateFixed size={18} />
          <span className="hidden sm:inline">My location</span>
        </button>
        <button
          onClick={() => setRefreshTick((n) => n + 1)}
          disabled={loading}
          title="Refresh forecast from backend"
          className="shrink-0 flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium px-3 rounded-xl disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span className="hidden md:inline">Refresh</span>
        </button>
      </div>

      {/* saved locations quick switcher */}
      {savedLocations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Saved:</span>
          {savedLocations.map((loc) => {
            const active =
              Math.abs(loc.latitude - city.latitude) < 0.02 &&
              Math.abs(loc.longitude - city.longitude) < 0.02;
            return (
              <button
                key={loc.id}
                onClick={() => setCity(loc)}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  active
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50"
                }`}
              >
                {loc.name}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && <p className="text-slate-500">Loading weather...</p>}

      {!loading && weather && (
        <>
          <WeatherCard
            city={city}
            weather={weather}
            air={air}
            isSaved={Boolean(savedMatch)}
            onToggleSave={handleToggleSave}
          />

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
                  <p className="text-sm font-semibold">
                    {convertTemp(h.temp, preferences.temperature_unit)}°
                  </p>
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

          {/* Rain Arrival Estimator + Smart Clothing Advisor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rainEst && (
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <CloudRain size={18} className="text-sky-600" />
                    Rain Arrival Estimate
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 capitalize">
                    {rainEst.intensity_category}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{rainEst.summary}</p>
                {rainEst.rain_expected && (
                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-slate-600">
                    <div className="bg-slate-50 rounded-xl p-2.5">
                      <span className="block text-slate-400">Window</span>
                      <span className="font-semibold">
                        {formatHour(rainEst.estimated_start)} –{" "}
                        {formatHour(rainEst.estimated_end)}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5">
                      <span className="block text-slate-400">Peak probability</span>
                      <span className="font-semibold">
                        {rainEst.peak_probability ?? 0}% ({rainEst.total_precipitation_mm} mm)
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 pt-1">
                  {rainEst.estimate_label}
                </p>
              </section>
            )}

            {clothing && (
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Shirt size={18} className="text-sky-600" />
                    Smart Clothing Advisor
                  </h3>
                  <span className="text-xs text-slate-500">
                    Next {clothing.window_hours}h ·{" "}
                    {clothing.weather_inputs?.feels_like_min}–
                    {clothing.weather_inputs?.feels_like_max}
                    {tSym}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(clothing.recommended_items || []).map((item) => (
                    <span
                      key={item}
                      className="text-xs bg-sky-50 text-sky-800 border border-sky-200 rounded-full px-3 py-1"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                {clothing.reasons?.length > 0 && (
                  <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                    {clothing.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}

                {clothing.comfort_cautions?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 space-y-1">
                    {clothing.comfort_cautions.map((c, i) => (
                      <p key={i}>• {c}</p>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-slate-400">{clothing.disclaimer}</p>
              </section>
            )}
          </div>

          {/* Alerts, Advisories & Nearby Community Reports */}
          {alerts && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldAlert size={18} className="text-sky-600" />
                  Weather Alerts & Advisories
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border ${
                    alerts.official_feed_status === "available"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  Official feed: {alerts.official_feed_status}
                </span>
              </div>

              {alerts.official_alerts?.length > 0 ? (
                <div className="space-y-2">
                  {alerts.official_alerts.map((a) => (
                    <div
                      key={a.id}
                      className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm"
                    >
                      <p className="font-semibold text-red-800">
                        [{a.severity.toUpperCase()}] {a.headline}
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Source: {a.source} · Area: {a.area}
                      </p>
                      {a.description && (
                        <p className="text-xs text-red-700 mt-1">{a.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {alerts.official_feed_message}
                </p>
              )}

              {alerts.advisories?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Application Advisories (Non-official)
                  </p>
                  {alerts.advisories.map((adv, idx) => (
                    <div
                      key={idx}
                      className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm flex items-start gap-2"
                    >
                      <AlertTriangle
                        size={16}
                        className="text-amber-600 shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="font-medium text-amber-900">{adv.headline}</p>
                        <p className="text-xs text-amber-800">{adv.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {alerts.community_reports?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Users size={13} /> Nearby Approved Community Reports
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {alerts.community_reports.map((rep) => (
                      <div
                        key={rep.id}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-medium text-slate-700">
                          <span className="capitalize">
                            {rep.category.replace("_", " ")}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {rep.verification_status}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">{rep.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
