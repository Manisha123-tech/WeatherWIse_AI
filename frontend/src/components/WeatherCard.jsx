import { Droplets, Wind, Gauge, Sunrise, Sunset, Sun, Leaf } from "lucide-react";
import {
  getWeatherInfo,
  getAqiInfo,
  windDirectionText,
  formatHour,
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

function WeatherCard({ city, weather, air }) {
  const { current, daily } = weather;
  const info = getWeatherInfo(current.code, current.isDay);
  const aqiInfo = getAqiInfo(air?.aqi);
  const today = daily[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{city.name}</h2>
          <p className="text-sm text-slate-500">
            {[city.admin1, city.country].filter(Boolean).join(", ")}
          </p>
          <p className="mt-3 text-slate-600">{info.label}</p>
          <p className="text-sm text-slate-500">
            H: {today.max}° &nbsp; L: {today.min}°
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-6xl">{info.icon}</span>
          <div>
            <p className="text-5xl font-bold text-slate-800">{current.temp}°C</p>
            <p className="text-sm text-slate-500">
              Feels like {current.feelsLike}°C
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <Stat icon={Droplets} label="Humidity" value={`${current.humidity}%`} />
        <Stat
          icon={Wind}
          label="Wind"
          value={`${current.wind} km/h ${windDirectionText(current.windDirection)}`}
        />
        <Stat icon={Gauge} label="Pressure" value={`${current.pressure} hPa`} />
        <Stat icon={Sun} label="UV Index" value={today.uv} />
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
    </div>
  );
}

export default WeatherCard;