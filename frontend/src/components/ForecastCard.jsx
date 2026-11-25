import { Droplets } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { convertTemp, formatDay, getWeatherInfo } from "../services/api";

function ForecastCard({ day, isToday = false }) {
  const { preferences } = useAuth();
  const unit = preferences.temperature_unit;
  const info = getWeatherInfo(day.code);
  const maxTemp = convertTemp(day.max, unit);
  const minTemp = convertTemp(day.min, unit);

  return (
    <div
      className={`rounded-2xl border p-4 text-center transition-shadow hover:shadow-md ${
        isToday ? "bg-sky-50 border-sky-300" : "bg-white border-slate-200"
      }`}
    >
      <p className="text-sm font-semibold text-slate-700">
        {isToday ? "Today" : formatDay(day.date)}
      </p>
      <p className="text-4xl my-2">{info.icon}</p>
      <p className="text-xs text-slate-500 h-8">{day.condition || info.label}</p>
      <p className="mt-1 font-bold text-slate-800">
        {maxTemp ?? "—"}°{" "}
        <span className="font-normal text-slate-400">{minTemp ?? "—"}°</span>
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-xs text-sky-600">
        <Droplets size={12} />
        {day.rainChance ?? 0}%
      </p>
    </div>
  );
}

export default ForecastCard;
