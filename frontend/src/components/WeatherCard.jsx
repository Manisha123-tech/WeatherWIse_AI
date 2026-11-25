import {
  Bookmark,
  BookmarkCheck,
  Droplets,
  Gauge,
  Leaf,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import {
  convertTemp,
  convertWind,
  formatHour,
  getAqiInfo,
  getWeatherInfo,
  tempSymbol,
  windDirectionText,
  windSymbol,
} from "../services/api";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
      <Icon size={20} className="text-sky-600 shrink-0" />
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function WeatherCard({ city, weather, air, isSaved = false, onToggleSave }) {
  const { preferences } = useAuth();
  const tempUnit = preferences.temperature_unit;
  const windUnit = preferences.wind_speed_unit;
  const tSym = tempSymbol(tempUnit);
  const wSym = windSymbol(windUnit);

  const { current, daily, meta } = weather;
  const info = getWeatherInfo(current.code, current.isDay);
  const aqiInfo = getAqiInfo(air?.aqi);
  const today = daily[0] || {};

  const tempNow = convertTemp(current.temp, tempUnit);
  const feelsLike = convertTemp(current.feelsLike, tempUnit);
  const todayHigh = convertTemp(today.max, tempUnit);
  const todayLow = convertTemp(today.min, tempUnit);
  const windNow = convertWind(current.wind, windUnit);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      {meta?.warning && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2">
          {meta.warning}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-slate-800">{city.name}</h2>
            {onToggleSave && (
              <button
                type="button"
                onClick={onToggleSave}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  isSaved
                    ? "bg-sky-50 border-sky-200 text-sky-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                {isSaved ? "Saved" : "Save"}
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {[city.admin1, city.country].filter(Boolean).join(", ")}
          </p>
          <p className="mt-3 text-slate-600">{current.condition || info.label}</p>
          <p className="text-sm text-slate-500">
            H: {todayHigh ?? "—"}° &nbsp; L: {todayLow ?? "—"}°
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-6xl">{info.icon}</span>
          <div>
            <p className="text-5xl font-bold text-slate-800">
              {tempNow ?? "—"}
              {tSym}
            </p>
            <p className="text-sm text-slate-500">
              Feels like {feelsLike ?? "—"}
              {tSym}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <Stat
          icon={Droplets}
          label="Humidity"
          value={current.humidity != null ? `${current.humidity}%` : "N/A"}
        />
        <Stat
          icon={Wind}
          label="Wind"
          value={
            windNow != null
              ? `${windNow} ${wSym} ${windDirectionText(current.windDirection)}`.trim()
              : "N/A"
          }
        />
        <Stat
          icon={Gauge}
          label="Pressure"
          value={current.pressure != null ? `${current.pressure} hPa` : "N/A"}
        />
        <Stat
          icon={Sun}
          label="UV Index"
          value={today.uv != null ? today.uv : "N/A"}
        />
        <Stat icon={Sunrise} label="Sunrise" value={formatHour(today.sunrise)} />
        <Stat icon={Sunset} label="Sunset" value={formatHour(today.sunset)} />
        <div className="col-span-2 bg-slate-50 rounded-xl p-3 flex items-center gap-3">
          <Leaf size={20} className="text-sky-600 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Air Quality (US AQI)</p>
            <p className={`text-sm font-semibold ${aqiInfo.color}`}>
              {air?.aqi ?? "N/A"} · {aqiInfo.label}
            </p>
          </div>
        </div>
      </div>

      {meta?.fetchedAt && (
        <p className="mt-4 text-[11px] text-slate-400">
          Source: {meta.source || "open-meteo"} ·{" "}
          {meta.stale ? "Stale cache fallback" : meta.cached ? "Cached" : "Live"} ·{" "}
          Updated {new Date(meta.fetchedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export default WeatherCard;
