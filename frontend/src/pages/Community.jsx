import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CheckCircle,
  Clock,
  MapPin,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import SearchBar from "../components/SearchBar";
import { useAuth } from "../context/useAuth";
import {
  createCommunityReport,
  deleteCommunityReport,
  expireCommunityReports,
  listCommunityReports,
  moderateCommunityReport,
} from "../services/api";

const CATEGORIES = [
  { value: "rain", label: "Rain", icon: "🌧️" },
  { value: "heavy_rain", label: "Heavy rain", icon: "⛈️" },
  { value: "thunderstorm", label: "Thunderstorm", icon: "⚡" },
  { value: "flooding", label: "Flooding", icon: "🌊" },
  { value: "waterlogging", label: "Waterlogging", icon: "💧" },
  { value: "strong_wind", label: "Strong wind", icon: "💨" },
  { value: "fog", label: "Fog", icon: "🌫️" },
  { value: "heat", label: "Heat", icon: "🥵" },
  { value: "cold", label: "Cold", icon: "🥶" },
  { value: "clear", label: "Clear", icon: "☀️" },
];

const iconOf = (val) => CATEGORIES.find((c) => c.value === val)?.icon || "🌤️";
const labelOf = (val) =>
  CATEGORIES.find((c) => c.value === val)?.label || val.replace("_", " ");

export default function Community() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // form state
  const [reporterName, setReporterName] = useState("");
  const [city, setCity] = useState(null);
  const [category, setCategory] = useState("rain");
  const [description, setDescription] = useState("");
  const [photoRef, setPhotoRef] = useState("");
  const [expiryHours, setExpiryHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [includeExpired, setIncludeExpired] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);

  const loadReports = useCallback(() => {
    setReloadTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      setLoading(true);
      setError("");
      try {
        const data = await listCommunityReports({
          status: statusFilter,
          category: categoryFilter,
          include_expired: includeExpired,
        });
        if (!cancelled) setReports(data.reports || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load community reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchReports();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, categoryFilter, includeExpired, reloadTick]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!city) {
      setError("Please search and select your city.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Description must be at least 5 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await createCommunityReport({
        category,
        description: description.trim(),
        latitude: city.latitude,
        longitude: city.longitude,
        location_name: [city.name, city.country].filter(Boolean).join(", "),
        ...(user ? {} : { reporter_name: reporterName.trim() || "Anonymous" }),
        ...(photoRef.trim() ? { photo_reference: photoRef.trim() } : {}),
        expires_in_hours: Number(expiryHours) || 24,
      });
      setDescription("");
      setPhotoRef("");
      setCity(null);
      setNotice(
        "Report submitted! New reports start as 'pending' moderation until approved."
      );
      setStatusFilter("all");
      await loadReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleModerate(id, patch) {
    setError("");
    try {
      await moderateCommunityReport(id, patch);
      await loadReports();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      await deleteCommunityReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExpireOld() {
    setError("");
    setNotice("");
    try {
      const res = await expireCommunityReports();
      setNotice(`Archived ${res.archived_count} expired report(s).`);
      await loadReports();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Community reports</h2>
          <p className="text-sm text-slate-500">
            Report local weather conditions with moderation, verification, and expiry.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExpireOld}
          className="flex items-center gap-1.5 text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl"
        >
          <Archive size={14} /> Archive expired
        </button>
      </div>

      {/* new report form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <h3 className="font-semibold text-slate-800">Submit a weather report</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!user ? (
            <input
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              maxLength={40}
              placeholder="Your name (optional)"
              className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
          ) : (
            <div className="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-600">
              Posting as <b>{user.username}</b>
            </div>
          )}

          <select
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value={6}>Expires in 6 hours</option>
            <option value={12}>Expires in 12 hours</option>
            <option value={24}>Expires in 24 hours</option>
            <option value={48}>Expires in 48 hours</option>
          </select>
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
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`text-xs rounded-full px-3 py-1.5 border ${
                category === c.value
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Describe local conditions (5–500 characters)..."
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />
          <p className="text-xs text-slate-400 text-right">{description.length}/500</p>
        </div>

        <input
          value={photoRef}
          onChange={(e) => setPhotoRef(e.target.value)}
          placeholder="Optional photo filename (e.g. street_rain.jpg)"
          className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
        )}
        {notice && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50"
        >
          <Send size={16} />
          {submitting ? "Submitting..." : "Submit report"}
        </button>
      </form>

      {/* filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {["all", "approved", "pending", "rejected", "archived"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`text-xs capitalize rounded-full px-3 py-1 border ${
                  statusFilter === st
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={(e) => setIncludeExpired(e.target.checked)}
              className="rounded border-slate-300"
            />
            Include expired
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`text-xs rounded-full px-2.5 py-1 border ${
              categoryFilter === "all"
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`text-xs rounded-full px-2.5 py-1 border ${
                categoryFilter === c.value
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* reports list */}
      {loading ? (
        <p className="text-slate-500">Loading community reports...</p>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
          No reports found for this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((p) => {
            const canDelete = p.user_id == null || (user && user.id === p.user_id);
            return (
              <article
                key={p.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center">
                      {(p.reporter_name || "A")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {p.reporter_name || "Anonymous"}
                        {user && p.user_id === user.id && (
                          <span className="ml-2 text-[10px] bg-sky-100 text-sky-700 rounded-full px-2 py-0.5">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                        <MapPin size={12} />
                        {p.location_name || `${p.latitude}, ${p.longitude}`} ·{" "}
                        <Clock size={12} />
                        {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-2xl leading-none">{iconOf(p.category)}</p>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      {labelOf(p.category)}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-700">{p.description}</p>

                {p.photo_reference && (
                  <p className="text-xs text-slate-500">
                    📎 Attachment: {p.photo_reference}
                  </p>
                )}

                {/* badges */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded-full border capitalize ${
                      p.moderation_status === "approved"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : p.moderation_status === "pending"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {p.moderation_status}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border capitalize ${
                      p.verification_status === "verified"
                        ? "bg-sky-50 text-sky-700 border-sky-200"
                        : p.verification_status === "disputed"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    {p.verification_status}
                  </span>
                  {p.is_expired && (
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                      Expired
                    </span>
                  )}
                </div>

                {/* moderation & delete controls */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                  {p.moderation_status !== "approved" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleModerate(p.id, { moderation_status: "approved" })
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                  )}
                  {p.moderation_status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleModerate(p.id, { moderation_status: "rejected" })
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  )}
                  {p.verification_status !== "verified" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleModerate(p.id, { verification_status: "verified" })
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100"
                    >
                      <ShieldCheck size={13} /> Verify
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={14} /> Delete
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
