import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  LogIn,
  LogOut,
  MapPin,
  Settings,
  Trash2,
  UserPlus,
} from "lucide-react";

import SearchBar from "../components/SearchBar";
import { useAuth } from "../context/useAuth";

export default function Account() {
  const {
    user,
    authLoading,
    preferences,
    savedLocations,
    login,
    register,
    logout,
    savePreferences,
    saveLocation,
    removeLocation,
  } = useAuth();

  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [prefMessage, setPrefMessage] = useState("");
  const [prefError, setPrefError] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [locError, setLocError] = useState("");

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      if (mode === "login") {
        await login(identifier, password);
      } else {
        await register(username, email, password);
      }
      setPassword("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handlePrefChange(patch) {
    setPrefError("");
    setPrefMessage("");
    setSavingPrefs(true);
    try {
      await savePreferences(patch);
      setPrefMessage(
        user
          ? "Preferences saved to your account."
          : "Applied for this session. Sign in to save across devices."
      );
    } catch (err) {
      setPrefError(err.message);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleAddSaved(city) {
    setLocError("");
    try {
      await saveLocation(city);
    } catch (err) {
      setLocError(err.message);
    }
  }

  async function handleRemoveSaved(id) {
    setLocError("");
    try {
      await removeLocation(id);
    } catch (err) {
      setLocError(err.message);
    }
  }

  if (authLoading) {
    return <p className="text-slate-500">Loading account...</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Account & Preferences</h2>
        <p className="text-sm text-slate-500">
          Manage your WeatherWise account, comfort & unit settings, and saved cities.
        </p>
      </div>

      {/* Authentication card */}
      {!user ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setAuthError("");
              }}
              className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border ${
                mode === "login"
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <LogIn size={16} /> Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setAuthError("");
              }}
              className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border ${
                mode === "register"
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <UserPlus size={16} /> Create account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {mode === "login" ? (
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Username or email"
                required
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username (3-32 chars)"
                  required
                  className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            )}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              required
              minLength={6}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />

            {authError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50"
            >
              {authSubmitting
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-lg">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800">{user.username}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 border border-slate-200 rounded-xl px-3.5 py-2"
          >
            <LogOut size={16} /> Sign out
          </button>
        </section>
      )}

      {/* Preferences */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-sky-600" />
          <h3 className="font-semibold text-slate-800">Weather & Comfort Preferences</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="text-xs text-slate-500 space-y-1">
            <span>Temperature unit</span>
            <select
              value={preferences.temperature_unit}
              disabled={savingPrefs}
              onChange={(e) => handlePrefChange({ temperature_unit: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none"
            >
              <option value="celsius">Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </label>

          <label className="text-xs text-slate-500 space-y-1">
            <span>Wind speed unit</span>
            <select
              value={preferences.wind_speed_unit}
              disabled={savingPrefs}
              onChange={(e) => handlePrefChange({ wind_speed_unit: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none"
            >
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
            </select>
          </label>

          <label className="text-xs text-slate-500 space-y-1">
            <span>Comfort sensitivity</span>
            <select
              value={preferences.comfort_preference}
              disabled={savingPrefs}
              onChange={(e) => handlePrefChange({ comfort_preference: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white outline-none"
            >
              <option value="normal">Normal</option>
              <option value="cold_sensitive">Cold sensitive</option>
              <option value="heat_sensitive">Heat sensitive</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(preferences.notifications_on)}
            disabled={savingPrefs}
            onChange={(e) => handlePrefChange({ notifications_on: e.target.checked })}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-400"
          />
          Enable weather advisory notifications
        </label>

        {prefError && <p className="text-sm text-red-600">{prefError}</p>}
        {prefMessage && <p className="text-sm text-green-600">{prefMessage}</p>}
      </section>

      {/* Saved Locations */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bookmark size={18} className="text-sky-600" />
          <h3 className="font-semibold text-slate-800">Saved Locations</h3>
        </div>

        {!user ? (
          <p className="text-sm text-slate-500">
            Sign in above to save favorite cities to your account.
          </p>
        ) : (
          <>
            <SearchBar
              onSelect={handleAddSaved}
              placeholder="Search a city to save..."
            />

            {locError && <p className="text-sm text-red-600">{locError}</p>}

            {savedLocations.length === 0 ? (
              <p className="text-sm text-slate-500">
                No saved locations yet. Search above or tap Save on the Dashboard.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {savedLocations.map((loc) => (
                  <li
                    key={loc.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => navigate("/", { state: { city: loc } })}
                      className="flex items-center gap-2 text-left hover:text-sky-700"
                    >
                      <MapPin size={16} className="text-sky-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{loc.name}</p>
                        <p className="text-xs text-slate-500">
                          {[loc.admin1, loc.country].filter(Boolean).join(", ") ||
                            `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveSaved(loc.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                      aria-label={`Remove ${loc.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
