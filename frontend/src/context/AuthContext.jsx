import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./useAuth";
import {
  addSavedLocation,
  deleteSavedLocation,
  fetchCurrentUser,
  getPreferences,
  getStoredToken,
  listSavedLocations,
  loginUser,
  registerUser,
  setStoredToken,
  updatePreferences,
} from "../services/api";

const DEFAULT_PREFERENCES = {
  temperature_unit: "celsius",
  wind_speed_unit: "kmh",
  notifications_on: true,
  comfort_preference: "normal",
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [savedLocations, setSavedLocations] = useState([]);
  const [authLoading, setAuthLoading] = useState(() => Boolean(getStoredToken()));

  const loadAccountData = useCallback(async () => {
    try {
      const [meData, prefsData, savedData] = await Promise.all([
        fetchCurrentUser(),
        getPreferences(),
        listSavedLocations(),
      ]);
      setUser(meData.user);
      setPreferences({ ...DEFAULT_PREFERENCES, ...prefsData });
      setSavedLocations(savedData.locations || []);
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setPreferences(DEFAULT_PREFERENCES);
      setSavedLocations([]);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function syncAccount() {
      try {
        const [meData, prefsData, savedData] = await Promise.all([
          fetchCurrentUser(),
          getPreferences(),
          listSavedLocations(),
        ]);
        if (cancelled) return;
        setUser(meData.user);
        setPreferences({ ...DEFAULT_PREFERENCES, ...prefsData });
        setSavedLocations(savedData.locations || []);
      } catch {
        if (cancelled) return;
        setStoredToken(null);
        setToken(null);
        setUser(null);
        setPreferences(DEFAULT_PREFERENCES);
        setSavedLocations([]);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    syncAccount();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function login(identifier, password) {
    const data = await loginUser({ identifier, password });
    setAuthLoading(true);
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(username, email, password) {
    const data = await registerUser({ username, email, password });
    setAuthLoading(true);
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setPreferences(DEFAULT_PREFERENCES);
    setSavedLocations([]);
    setAuthLoading(false);
  }

  async function savePreferences(nextPrefs) {
    if (!token) {
      setPreferences((prev) => ({ ...prev, ...nextPrefs }));
      return { ...preferences, ...nextPrefs };
    }
    const updated = await updatePreferences(nextPrefs);
    setPreferences({ ...DEFAULT_PREFERENCES, ...updated });
    return updated;
  }

  async function saveLocation(loc) {
    const created = await addSavedLocation({
      name: loc.name,
      country: loc.country || null,
      admin1: loc.admin1 || null,
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    setSavedLocations((prev) => [created, ...prev]);
    return created;
  }

  async function removeLocation(id) {
    await deleteSavedLocation(id);
    setSavedLocations((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authLoading,
        preferences,
        savedLocations,
        login,
        register,
        logout,
        savePreferences,
        saveLocation,
        removeLocation,
        refreshAccountData: loadAccountData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
