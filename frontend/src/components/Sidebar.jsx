import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  GitCompare,
  Map,
  Bot,
  Target,
  Users,
  Plane,
} from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/search", label: "Search", icon: Search },
  { to: "/comparison", label: "Comparison", icon: GitCompare },
  { to: "/map", label: "Weather Map", icon: Map },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
  { to: "/accuracy", label: "Accuracy", icon: Target },
  { to: "/community", label: "Community", icon: Users },
  { to: "/travel", label: "Travel Planner", icon: Plane },
];

function Sidebar({ open, setOpen }) {
  return (
    <>
      {/* dark overlay on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed top-16 bottom-0 left-0 w-64 bg-white border-r border-slate-200 z-20 p-3 overflow-y-auto transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <nav className="flex flex-col gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sky-100 text-sky-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;