import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchCities } from "../services/api";

function SearchBar({ onSelect, placeholder = "Search city..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // search 400ms after the user stops typing
  useEffect(() => {
    if (query.trim().length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchCities(query);
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  // close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(city) {
    onSelect(city);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-sky-400">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm bg-transparent"
        />
        {loading && <Loader2 size={18} className="animate-spin text-sky-500" />}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
          {results.map((city) => (
            <li key={city.id}>
              <button
                onClick={() => handleSelect(city)}
                className="w-full text-left px-4 py-2.5 hover:bg-sky-50 text-sm"
              >
                <span className="font-medium text-slate-800">{city.name}</span>
                <span className="text-slate-500">
                  {city.admin1 ? `, ${city.admin1}` : ""}, {city.country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-slate-500">
          No city found
        </div>
      )}
    </div>
  );
}

export default SearchBar;