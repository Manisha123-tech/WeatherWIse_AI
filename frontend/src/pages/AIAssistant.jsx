import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";

import SearchBar from "../components/SearchBar";
import {
  getWeather,
  getAirQuality,
  getWeatherInfo,
  getAqiInfo,
  formatDay,
  formatHour,
  windDirectionText,
} from "../services/api";

const DEFAULT_CITY = {
  id: 1258980,
  name: "Ranchi",
  admin1: "Jharkhand",
  country: "India",
  latitude: 23.3441,
  longitude: 85.3096,
};

const SUGGESTIONS = [
  "Do I need an umbrella today?",
  "What should I wear?",
  "Weather tomorrow?",
  "Is it good to go for a run?",
  "How is the air quality?",
  "Which day is best this week?",
];

// ---------- answer engine ----------
const has = (q, words) => words.some((w) => q.includes(w));

// hours that are still left today
function hoursLeftToday(weather) {
  const nowKey = weather.current.time.slice(0, 13);
  const today = weather.current.time.slice(0, 10);
  return weather.hourly.filter(
    (h) => h.time.slice(0, 10) === today && h.time.slice(0, 13) >= nowKey
  );
}

function buildAnswer(question, city, weather, air) {
  const q = question.toLowerCase();
  const { current, daily } = weather;
  const today = daily[0];
  const tomorrow = daily[1];
  const info = getWeatherInfo(current.code, current.isDay);
  const wantsTomorrow = has(q, ["tomorrow", "next day"]);
  const day = wantsTomorrow ? tomorrow : today;
  const dayName = wantsTomorrow ? "tomorrow" : "today";

  // greeting
  if (/^(hi|hello|hey|namaste)\b/.test(q)) {
    return `Hello! I can help with the weather in ${city.name}. Try asking about rain, what to wear, air quality or the weekly forecast.`;
  }

  // rain / umbrella
  if (has(q, ["umbrella", "rain", "shower", "storm", "thunder", "wet"])) {
    const chance = day.rainChance ?? 0;
    let text = `Chance of rain ${dayName} in ${city.name} is ${chance}%, with about ${day.rain} mm expected.`;

    if (!wantsTomorrow) {
      const wetHours = hoursLeftToday(weather).filter((h) => (h.rainChance ?? 0) >= 50);
      if (wetHours.length > 0) {
        text += `\nRain is likely around ${formatHour(wetHours[0].time)}.`;
      } else {
        text += `\nNo high rain chances for the rest of today.`;
      }
    }

    if (chance >= 60) text += "\n☔ Yes, carry an umbrella.";
    else if (chance >= 30) text += "\n🌂 A small umbrella is a good idea, just in case.";
    else text += "\n😎 You can leave the umbrella at home.";
    return text;
  }

  // clothes / temperature feel
  if (has(q, ["wear", "jacket", "cloth", "sweater", "dress", "cold", "hot", "warm", "cool"])) {
    const avg = Math.round((day.max + day.min) / 2);
    let advice;
    if (day.max >= 35) advice = "It will be very hot. Wear light cotton clothes, a cap, and drink plenty of water.";
    else if (day.max >= 28) advice = "Warm weather. Light, breathable clothes are best.";
    else if (day.max >= 20) advice = "Comfortable weather. A t-shirt works, and a light layer for the evening.";
    else if (day.max >= 12) advice = "It is cool. Wear a jacket or sweater.";
    else advice = "It is cold. Wear warm layers, a heavy jacket and a scarf.";

    if (day.min <= 12 && day.max >= 20) advice += " Mornings and nights will be cooler, so carry a layer.";
    if ((day.rainChance ?? 0) >= 50) advice += " Also take a raincoat or umbrella.";

    return `${dayName[0].toUpperCase() + dayName.slice(1)} in ${city.name}: high ${day.max}°C, low ${day.min}°C (average ${avg}°C).\n👕 ${advice}`;
  }

  // tomorrow (general)
  if (wantsTomorrow) {
    const t = getWeatherInfo(tomorrow.code);
    return `Tomorrow in ${city.name}: ${t.icon} ${t.label}.\nHigh ${tomorrow.max}°C, low ${tomorrow.min}°C, rain chance ${tomorrow.rainChance ?? 0}%, UV index ${tomorrow.uv}.`;
  }

  // best day of the week
  if (has(q, ["best day", "which day", "good day"])) {
    const scored = daily.map((d) => ({
      d,
      score: (d.rainChance ?? 0) + Math.abs(d.max - 26) * 2,
    }));
    scored.sort((a, b) => a.score - b.score);
    const best = scored[0].d;
    const bi = getWeatherInfo(best.code);
    return `The best day looks like ${formatDay(best.date)} (${best.date}): ${bi.icon} ${bi.label}, high ${best.max}°C, rain chance ${best.rainChance ?? 0}%.`;
  }

  // weekly forecast
  if (has(q, ["week", "7 day", "7-day", "forecast", "next few days", "weekend"])) {
    const lines = daily.map((d, i) => {
      const di = getWeatherInfo(d.code);
      return `${i === 0 ? "Today" : formatDay(d.date)}: ${di.icon} ${d.max}°/${d.min}°, rain ${d.rainChance ?? 0}%`;
    });
    return `7-day forecast for ${city.name}:\n${lines.join("\n")}`;
  }

  // wind
  if (has(q, ["wind", "breeze", "windy"])) {
    const strength = current.wind >= 40 ? "very strong" : current.wind >= 25 ? "strong" : current.wind >= 12 ? "moderate" : "light";
    return `💨 Wind in ${city.name} is ${current.wind} km/h from the ${windDirectionText(current.windDirection)}, which is ${strength}. Today's maximum is ${today.windMax} km/h.`;
  }

  // humidity
  if (has(q, ["humid", "sticky", "moisture"])) {
    const feel = current.humidity >= 75 ? "quite humid and sticky" : current.humidity >= 45 ? "comfortable" : "dry";
    return `💧 Humidity in ${city.name} is ${current.humidity}%, which feels ${feel}.`;
  }

  // UV / sunscreen
  if (has(q, ["uv", "sunscreen", "sunburn", "sun protection"])) {
    const uv = today.uv;
    const level = uv >= 11 ? "extreme" : uv >= 8 ? "very high" : uv >= 6 ? "high" : uv >= 3 ? "moderate" : "low";
    const tip = uv >= 6 ? "Use sunscreen, sunglasses and avoid midday sun." : uv >= 3 ? "Sunscreen is recommended if you are outside for long." : "No special protection needed.";
    return `☀️ Today's UV index in ${city.name} is ${uv} (${level}). ${tip}`;
  }

  // air quality
  if (has(q, ["air", "aqi", "pollution", "mask", "smog", "breath"])) {
    if (air?.aqi == null) return "Air quality data is not available for this location right now.";
    const a = getAqiInfo(air.aqi);
    let tip = "Air is fine for outdoor activity.";
    if (air.aqi > 150) tip = "Avoid long outdoor activity and wear an N95 mask if you must go out.";
    else if (air.aqi > 100) tip = "Sensitive people (children, elderly, asthma) should limit time outside.";
    else if (air.aqi > 50) tip = "Acceptable for most people.";
    return `🌿 Air quality in ${city.name}: US AQI ${air.aqi} (${a.label}).\nPM2.5: ${air.pm25} µg/m³, PM10: ${air.pm10} µg/m³.\n${tip}`;
  }

  // sunrise / sunset
  if (has(q, ["sunrise", "sunset", "sun rise", "sun set"])) {
    return `🌅 Sunrise: ${formatHour(today.sunrise)}\n🌇 Sunset: ${formatHour(today.sunset)}`;
  }

  // outdoor activities
  if (has(q, ["outdoor", "run", "jog", "walk", "exercise", "picnic", "cricket", "play", "trip", "cycle", "bike", "go out"])) {
    const problems = [];
    if ((today.rainChance ?? 0) >= 50) problems.push(`rain chance is ${today.rainChance}%`);
    if (current.temp >= 35) problems.push(`it is hot (${current.temp}°C)`);
    if (current.temp <= 5) problems.push(`it is very cold (${current.temp}°C)`);
    if (air?.aqi > 100) problems.push(`air quality is ${getAqiInfo(air.aqi).label.toLowerCase()} (AQI ${air.aqi})`);
    if (current.wind >= 30) problems.push(`it is windy (${current.wind} km/h)`);
    if (today.uv >= 8) problems.push(`UV is very high (${today.uv})`);

    if (problems.length === 0) {
      return `✅ Good conditions in ${city.name}: ${current.temp}°C, ${info.label.toLowerCase()}, low rain chance and decent air. Enjoy your time outside!`;
    }
    return `⚠️ Not ideal right now because ${problems.join(", ")}.\nIf you go, pick a safer time and take precautions.`;
  }

  // current weather / default
  if (has(q, ["temperature", "temp", "weather", "now", "today", "how is", "how's", "like outside"])) {
    return `${info.icon} ${city.name} right now: ${current.temp}°C (feels like ${current.feelsLike}°C), ${info.label.toLowerCase()}.\nToday: high ${today.max}°C, low ${today.min}°C, rain chance ${today.rainChance ?? 0}%.\nHumidity ${current.humidity}%, wind ${current.wind} km/h.`;
  }

  return "I'm not sure about that one. I can answer questions about rain, temperature, clothes, wind, humidity, UV, air quality, sunrise/sunset, outdoor plans and the 7-day forecast.";
}

// ---------- page ----------
export default function AIAssistant() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I'm your WeatherWise assistant. Ask me about the weather, or tap a suggestion below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const chatRef = useRef(null);

  // load weather for the selected city
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [w, a] = await Promise.all([
          getWeather(city.latitude, city.longitude),
          getAirQuality(city.latitude, city.longitude),
        ]);
        if (!cancelled) {
          setWeather(w);
          setAir(a);
        }
      } catch {
        if (!cancelled) setError("Could not load weather data. Check your internet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city]);

  // keep chat scrolled to the bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, typing]);

  function handleCity(c) {
    setCity(c);
    setMessages((m) => [
      ...m,
      { role: "bot", text: `Okay, now I'm using the weather for ${c.name}. What would you like to know?` },
    ]);
  }

  function send(text) {
    const t = text.trim();
    if (!t || !weather || typing) return;

    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      const reply = buildAnswer(t, city, weather, air);
      setMessages((m) => [...m, { role: "bot", text: reply }]);
      setTyping(false);
    }, 500);
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">AI Assistant</h2>
        <p className="text-sm text-slate-500 mb-3">
          Answers are based on live forecast data for{" "}
          <b className="text-slate-700">{city.name}</b>. Search to change the city.
        </p>
        <SearchBar onSelect={handleCity} placeholder="Change city..." />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-[480px]">
        {/* messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === "user" ? "bg-slate-200 text-slate-700" : "bg-sky-100 text-sky-700"
                }`}
              >
                {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-sky-600 text-white rounded-tr-sm"
                    : "bg-slate-100 text-slate-800 rounded-tl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* suggestions */}
        <div className="border-t border-slate-100 px-3 py-2 flex gap-2 overflow-x-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading || !weather}
              className="shrink-0 text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-full px-3 py-1.5 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {/* input */}
        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? "Loading weather..." : "Ask about the weather..."}
            disabled={loading || !weather}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={loading || !weather || !input.trim()}
            className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 flex items-center disabled:opacity-50"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}