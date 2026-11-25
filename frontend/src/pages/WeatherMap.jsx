import { useEffect, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CloudRain } from "lucide-react";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import SearchBar from "../components/SearchBar";
import WeatherCard from "../components/WeatherCard";
import ForecastCard from "../components/ForecastCard";
import { useAuth } from "../context/useAuth";
import {
  convertTemp,
  getAirQuality,
  getWeather,
  getWeatherInfo,
  tempSymbol,
} from "../services/api";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const START = { latitude: 23.3441, longitude: 85.3096 }; // Ranchi

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.latitude, position.longitude], Math.max(map.getZoom(), 8), {
        duration: 1,
      });
    }
  }, [position, map]);
  return null;
}

export default function WeatherMap() {
  const { preferences } = useAuth();
  const tUnit = preferences.temperature_unit;
  const tSym = tempSymbol(tUnit);

  const [place, setPlace] = useState({
    name: "Ranchi",
    admin1: "Jharkhand",
    country: "India",
    ...START,
  });
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [radarOn, setRadarOn] = useState(false);
  const [radarUrl, setRadarUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [w, a] = await Promise.all([
          getWeather(place.latitude, place.longitude),
          getAirQuality(place.latitude, place.longitude),
        ]);
        if (!cancelled) {
          setWeather(w);
          setAir(a);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load weather for this spot.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [place]);

  useEffect(() => {
    if (!radarOn || radarUrl) return;

    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((data) => {
        const frames = data.radar?.past || [];
        const last = frames[frames.length - 1];
        if (last) {
          setRadarUrl(`${data.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`);
        }
      })
      .catch(() => setRadarOn(false));
  }, [radarOn, radarUrl]);

  function handleMapClick(lat, lng) {
    setPlace({
      name: "Selected location",
      admin1: `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      country: "",
      latitude: lat,
      longitude: lng,
    });
  }

  const info = weather ? getWeatherInfo(weather.current.code, weather.current.isDay) : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Weather map</h2>
        <p className="text-sm text-slate-500 mb-3">
          Click anywhere on the map, or search for a city.
        </p>
        <div className="flex gap-3">
          <SearchBar onSelect={setPlace} placeholder="Search a city on the map..." />
          <button
            onClick={() => setRadarOn(!radarOn)}
            className={`shrink-0 flex items-center gap-2 text-sm font-medium px-4 rounded-xl border ${
              radarOn
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <CloudRain size={18} />
            <span className="hidden sm:inline">Rain radar</span>
          </button>
        </div>
      </div>

      {/* map */}
      <div className="h-[420px] rounded-2xl overflow-hidden border border-slate-200 z-0 relative">
        <MapContainer
          center={[START.latitude, START.longitude]}
          zoom={6}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {radarOn && radarUrl && <TileLayer url={radarUrl} opacity={0.6} />}

          <ClickHandler onPick={handleMapClick} />
          <FlyTo position={place} />

          <Marker position={[place.latitude, place.longitude]} icon={defaultIcon}>
            <Popup>
              {weather && info ? (
                <div className="text-center">
                  <p className="font-semibold">{place.name}</p>
                  <p className="text-2xl">
                    {info.icon} {convertTemp(weather.current.temp, tUnit)}
                    {tSym}
                  </p>
                  <p className="text-xs">{weather.current.condition || info.label}</p>
                </div>
              ) : (
                "Loading..."
              )}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && <p className="text-slate-500">Loading weather...</p>}

      {!loading && weather && (
        <>
          <WeatherCard city={place} weather={weather} air={air} />

          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">7-day forecast</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {weather.daily.map((day, i) => (
                <ForecastCard key={day.date} day={day} isToday={i === 0} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
