import { useState } from "react";
import { Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import Comparison from "./pages/Comparison";
import WeatherMap from "./pages/WeatherMap";
import AIAssistant from "./pages/AIAssistant";
import Accuracy from "./pages/Accuracy";
import Community from "./pages/Community";
import TravelPlanner from "./pages/TravelPlanner";

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      <main className="pt-16 lg:ml-64">
        <div className="p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/search" element={<Search />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="/map" element={<WeatherMap />} />
            <Route path="/assistant" element={<AIAssistant />} />
            <Route path="/accuracy" element={<Accuracy />} />
            <Route path="/community" element={<Community />} />
            <Route path="/travel" element={<TravelPlanner />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;