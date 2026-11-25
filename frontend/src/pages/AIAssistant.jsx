import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";

import SearchBar from "../components/SearchBar";
import { useAuth } from "../context/useAuth";
import { askAssistant } from "../services/api";

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
  "What should I wear today?",
  "Will it rain tomorrow?",
  "Is it safe to travel today?",
  "What should I wear tomorrow?",
  "How is the weather right now?",
];

export default function AIAssistant() {
  const { preferences } = useAuth();
  const [city, setCity] = useState(DEFAULT_CITY);
  const [error, setError] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I'm your WeatherWise AI assistant powered by the backend forecast engine. Ask about umbrellas, rain, clothing, or travel.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, sending]);

  function handleCity(c) {
    setCity(c);
    setError("");
    setMessages((m) => [
      ...m,
      {
        role: "bot",
        text: `Okay, I've switched to ${c.name}. What would you like to know about the forecast?`,
      },
    ]);
  }

  async function send(text) {
    const t = text.trim();
    if (!t || sending) return;

    setError("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setSending(true);

    try {
      const data = await askAssistant({
        question: t,
        latitude: city.latitude,
        longitude: city.longitude,
        preferences: {
          comfort_preference: preferences.comfort_preference,
        },
      });
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: data.answer,
          intent: data.intent,
          window: data.window,
          disclaimer: data.disclaimer,
        },
      ]);
    } catch (err) {
      setError(err.message || "Could not reach the assistant backend.");
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: `Sorry, I could not get an answer right now: ${err.message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
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
          Forecast-grounded advice for <b className="text-slate-700">{city.name}</b>{" "}
          (comfort preference: {preferences.comfort_preference.replace("_", " ")}).
        </p>
        <SearchBar onSelect={handleCity} placeholder="Change city..." />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-[500px]">
        {/* messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === "user"
                    ? "bg-slate-200 text-slate-700"
                    : "bg-sky-100 text-sky-700"
                }`}
              >
                {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-sky-600 text-white rounded-tr-sm"
                    : "bg-slate-100 text-slate-800 rounded-tl-sm"
                }`}
              >
                {m.intent && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wide font-semibold bg-sky-200/70 text-sky-800 px-2 py-0.5 rounded-full">
                      {m.intent}
                    </span>
                    {m.window && (
                      <span className="text-[10px] text-slate-500">{m.window}</span>
                    )}
                  </div>
                )}
                <p>{m.text}</p>
                {m.disclaimer && (
                  <p className="mt-2 pt-1.5 border-t border-slate-200/80 text-[11px] text-slate-500">
                    {m.disclaimer}
                  </p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                Analyzing forecast...
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
              disabled={sending}
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
            maxLength={300}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about rain, umbrella, clothing, or travel..."
            disabled={sending}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
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
