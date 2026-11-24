import { CloudSun, Menu, X } from "lucide-react";

function Navbar({ sidebarOpen, setSidebarOpen }) {
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

        <div className="flex items-center gap-2">
          <CloudSun className="text-sky-600" size={28} />
          <span className="text-xl font-bold text-slate-800">
            Weather<span className="text-sky-600">Wise</span> AI
          </span>
        </div>
      </div>

      <div className="hidden sm:block text-sm text-slate-500">
        {new Date().toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </div>
    </header>
  );
}

export default Navbar;