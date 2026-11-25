import { Link } from "react-router-dom";
import { CloudSun, Menu, User, X } from "lucide-react";
import { useAuth } from "../context/useAuth";

function Navbar({ sidebarOpen, setSidebarOpen }) {
  const { user, preferences } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <Link to="/" className="flex items-center gap-2">
          <CloudSun className="text-sky-600" size={28} />
          <span className="text-xl font-bold text-slate-800">
            Weather<span className="text-sky-600">Wise</span> AI
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-sm text-slate-500">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>

        <Link
          to="/account"
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          <User size={16} className="text-sky-600" />
          <span>{user ? user.username : "Sign in"}</span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            · {preferences.temperature_unit === "fahrenheit" ? "°F" : "°C"}
          </span>
        </Link>
      </div>
    </header>
  );
}

export default Navbar;
