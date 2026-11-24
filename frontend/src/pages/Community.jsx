import { useEffect, useState } from "react";
import { Heart, Trash2, MapPin, Send } from "lucide-react";

import SearchBar from "../components/SearchBar";

const POSTS_KEY = "communityPosts";
const LIKES_KEY = "communityLikes";

const CONDITIONS = [
  { value: "Sunny", icon: "☀️" },
  { value: "Cloudy", icon: "☁️" },
  { value: "Rain", icon: "🌧️" },
  { value: "Storm", icon: "⛈️" },
  { value: "Fog", icon: "🌫️" },
  { value: "Hot", icon: "🥵" },
  { value: "Cold", icon: "🥶" },
  { value: "Windy", icon: "💨" },
];

const iconOf = (value) => CONDITIONS.find((c) => c.value === value)?.icon || "🌤️";

// example posts shown the first time
function seedPosts() {
  const now = Date.now();
  return [
    {
      id: 1,
      name: "Aman",
      city: "Ranchi, India",
      condition: "Rain",
      temp: 24,
      text: "Heavy rain started near Main Road. Roads are slippery, drive slowly.",
      likes: 12,
      createdAt: now - 1000 * 60 * 25,
      mine: false,
    },
    {
      id: 2,
      name: "Priya",
      city: "Delhi, India",
      condition: "Fog",
      temp: 11,
      text: "Thick fog this morning, visibility is very low. Use fog lights.",
      likes: 8,
      createdAt: now - 1000 * 60 * 60 * 3,
      mine: false,
    },
    {
      id: 3,
      name: "Rahul",
      city: "Mumbai, India",
      condition: "Sunny",
      temp: 33,
      text: "Clear sky and quite humid. Good day for the beach in the evening.",
      likes: 5,
      createdAt: now - 1000 * 60 * 60 * 7,
      mine: false,
    },
  ];
}

function loadPosts() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSTS_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    /* ignore */
  }
  return seedPosts();
}

function loadLikes() {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY)) || [];
  } catch {
    return [];
  }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export default function Community() {
  const [posts, setPosts] = useState(loadPosts);
  const [liked, setLiked] = useState(loadLikes);

  // form state
  const [name, setName] = useState("");
  const [city, setCity] = useState(null);
  const [condition, setCondition] = useState("Sunny");
  const [temp, setTemp] = useState("");
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");

  // view state
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("new");

  // save to the browser whenever data changes
  useEffect(() => {
    try {
      localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
    } catch {
      /* ignore */
    }
  }, [posts]);

  useEffect(() => {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify(liked));
    } catch {
      /* ignore */
    }
  }, [liked]);

  function handleSubmit(e) {
    e.preventDefault();

    if (!city) {
      setFormError("Please search and select your city.");
      return;
    }
    if (text.trim().length < 5) {
      setFormError("Please write at least 5 characters.");
      return;
    }

    const post = {
      id: Date.now(),
      name: name.trim() || "Anonymous",
      city: [city.name, city.country].filter(Boolean).join(", "),
      condition,
      temp: temp === "" ? null : Number(temp),
      text: text.trim(),
      likes: 0,
      createdAt: Date.now(),
      mine: true,
    };

    setPosts((p) => [post, ...p]);
    setText("");
    setTemp("");
    setCity(null);
    setFormError("");
  }

  function toggleLike(id) {
    const already = liked.includes(id);
    setLiked((l) => (already ? l.filter((x) => x !== id) : [...l, id]));
    setPosts((p) =>
      p.map((post) =>
        post.id === id
          ? { ...post, likes: Math.max(0, post.likes + (already ? -1 : 1)) }
          : post
      )
    );
  }

  function deletePost(id) {
    setPosts((p) => p.filter((post) => post.id !== id));
  }

  const visible = posts
    .filter((p) => filter === "All" || p.condition === filter)
    .sort((a, b) =>
      sort === "new" ? b.createdAt - a.createdAt : b.likes - a.likes
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Community reports</h2>
        <p className="text-sm text-slate-500">
          Share what the weather is like where you are. Posts are saved in this
          browser.
        </p>
      </div>

      {/* new post form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <h3 className="font-semibold text-slate-800">Post a weather report</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Your name (optional)"
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            type="number"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="Temperature °C (optional)"
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        <div>
          <SearchBar onSelect={setCity} placeholder="Search your city..." />
          {city && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">
              <MapPin size={14} />
              {[city.name, city.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCondition(c.value)}
              className={`text-sm rounded-full px-3 py-1.5 border ${
                condition === c.value
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {c.icon} {c.value}
            </button>
          ))}
        </div>

        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Describe the weather near you..."
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />
          <p className="text-xs text-slate-400 text-right">{text.length}/200</p>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
        >
          <Send size={16} />
          Post report
        </button>
      </form>

      {/* filter + sort */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["All", ...CONDITIONS.map((c) => c.value)].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs rounded-full px-3 py-1.5 border ${
                filter === f
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white outline-none"
        >
          <option value="new">Newest first</option>
          <option value="popular">Most liked</option>
        </select>
      </div>

      {/* posts */}
      {visible.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          No reports yet for this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const isLiked = liked.includes(p.id);
            return (
              <article
                key={p.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center">
                      {p.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {p.name}
                        {p.mine && (
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin size={12} />
                        {p.city} · {timeAgo(p.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-2xl leading-none">{iconOf(p.condition)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.condition}
                      {p.temp !== null && ` · ${p.temp}°C`}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">{p.text}</p>

                <div className="mt-3 flex items-center gap-4">
                  <button
                    onClick={() => toggleLike(p.id)}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-500"
                  >
                    <Heart
                      size={16}
                      className={isLiked ? "fill-red-500 text-red-500" : ""}
                    />
                    {p.likes}
                  </button>

                  {p.mine && (
                    <button
                      onClick={() => deletePost(p.id)}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}