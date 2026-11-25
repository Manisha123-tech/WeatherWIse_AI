# WeatherWise AI Backend — API Documentation

Base URL (local development): `http://127.0.0.1:5000`

All API responses (except `/api/health`) use the consistent JSON envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

On failure:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable error description."
  }
}
```

Common HTTP status codes: `200` OK, `201` Created, `400` Invalid Input, `401` Unauthorized, `403` Forbidden, `404` Not Found, `405` Method Not Allowed, `409` Conflict, `500` Internal Error, `502` Upstream Error/Unavailable, `504` Upstream Timeout.

---

## 1. Health
- **`GET /api/health`**
  - Output: `{ "status": "ok"|"error", "service": "WeatherWise AI backend", "database": "connected"|"error" }`

## 2. Location Search
- **`GET /api/location?q={query}&count={1..20}`**
  - Required: `q` (min 2 chars; city, town, locality, or supported postal/PIN code such as `834001`)
  - Optional: `count` (integer `1..20`, default `10`)
  - Failures: `400 INVALID_REQUEST`, `404 LOCATION_NOT_FOUND`, `502`/`504` upstream errors.

## 3. Current Weather & Forecasts
- **`GET /api/weather?city={name}`** or **`GET /api/weather?latitude={lat}&longitude={lon}`**
  - Optional: `refresh=true` to bypass fresh cache.
  - Output: `location`, `current` (`°C`, `%`, `km/h`, `°`, `mm`), `today`, `units`, `source`, `fetched_at` (UTC ISO), `cached`, `stale`, and `warning` (when serving stale offline fallback).
- **`GET /api/forecast?city={name}&hours={1..168}`** (also accepts `latitude` & `longitude`)
  - Optional: `hours` (`1..168`, default `24`), `refresh=true`.
  - Output: `location`, `hourly`, `daily` (7 days), `units`, and freshness metadata.
- **`GET /api/air-quality?city={name}`** (also accepts `latitude` & `longitude`)
  - Optional: `refresh=true`.
  - Output: `location`, `air_quality` (`us_aqi`, `pm2_5`, `pm10`, `time`), and freshness metadata.

## 4. Multi-Location Comparison
- **`GET /api/compare?cities=Ranchi,Delhi,Mumbai`**
  - Requires 2 to 5 unique city names.
- **`POST /api/compare`**
  - Body: `{"cities": ["Ranchi", "Delhi"]}` or `{"locations": [{"city": "Ranchi"}, {"latitude": 28.61, "longitude": 77.21}]}` (2–5 items).
  - Output: `cities` (current metrics, 12-hour hourly slice, 7-day daily slice), `failed` (partial per-location errors), `summary` (`hottest`, `coolest`, `most_humid`, `windiest`, `highest_rain_chance`), `units`.

## 5. AI Weather Decision Assistant
- **`POST /api/assistant`** and **`POST /api/assistant/recommend`**
  - Body: `{"question": "...", "city": "Ranchi"}` (or `latitude` & `longitude`), optional `"preferences": {"comfort_preference": "normal|cold_sensitive|heat_sensitive"}`.
  - Max `question` length: 300 characters.
  - Output: `question`, `intent`, `answer`, `window`, `facts`, `current`, `location`, `units`, `preferences_applied`, `disclaimer`, `supported_topics`.

## 6. Rain Arrival Estimator
- **`GET /api/rain-estimate?city={name}&hours={1..168}`** (also accepts `latitude` & `longitude`)
  - Output: `rain_expected`, `is_estimate` (`true`), `estimate_label`, `estimated_start`, `estimated_end`, `likely_duration_hours`, `peak_time`, `peak_probability` (`%`), `total_precipitation_mm` (`mm`), `intensity_category` (`none|light|moderate|heavy`), `summary`.

## 7. Smart Clothing & Comfort Advisor
- **`GET` / `POST /api/advisor/clothing`**
  - Inputs: `city` or `latitude`+`longitude`, optional `hours` (`1..168`, default `12`), `comfort_preference` (`normal|cold_sensitive|heat_sensitive`), `temperature_unit` (`celsius|fahrenheit`).
  - Output: `recommended_items`, `comfort_cautions`, `reasons`, `weather_inputs`, `disclaimer`.

## 8. Weather-Based Travel Planner
- **`POST /api/travel/analyze`**
  - Body: `origin` (string or `{city}` / `{latitude, longitude}`), `destination`, `departure_time` (ISO datetime), optional `estimated_duration_hours` (`0..72`, default `3`), optional `waypoints` (max 3).
  - Output: `departure_time`, `estimated_arrival_time`, `route_geometry_available` (`false`), `safety_claim` (`null`), `data_coverage`, `summary`, `checkpoints`, `suggestions`, `uncertainty_note`.

## 9. Forecast Accuracy & Reliability Tracker
- **`POST /api/accuracy/snapshots`**
  - Captures live Open-Meteo hourly snapshots (`{"city": "Ranchi", "hours": 24}`) or manual snapshot (`latitude`, `longitude`, `valid_time`, `predicted_temp`, optional `predicted_precip_prob`, `predicted_precip_mm`, `horizon_hours`).
- **`POST /api/accuracy/observations`**
  - Body: `city` or `latitude`+`longitude`, `observed_temp` (required), optional `observed_at`, `observed_precip_mm`, `observed_wind_kmh`, `source`.
- **`GET /api/accuracy`** and **`GET /api/accuracy/metrics`**
  - Optional query: `location_key`, `city`, or `latitude`+`longitude`.
  - Formula: `reliability_score = max(0, 100 - temperature_mae * 15)` (returns `status: "insufficient_data"` and `reliability_score: null` when matched samples `< ACCURACY_MIN_SAMPLES`, default `3`).

## 10. Community Weather Reports
- **`POST /api/community/reports`**
  - Body: `category` (`rain|heavy_rain|thunderstorm|flooding|waterlogging|strong_wind|fog|heat|cold|clear`), `description` (5–500 chars), `latitude`+`longitude` or `city`, optional `photo_reference` (`.jpg/.jpeg/.png/.webp`), optional `expires_in_hours` (`1..168`, default `24`). Defaults to `moderation_status="pending"`, `verification_status="unverified"`.
- **`GET /api/community/reports`**
  - Filters: `status` (default `approved`), `verification_status`, `category`, `include_expired`, `latitude`, `longitude`, `radius_km`.
- **`PATCH /api/community/reports/{id}/moderate`**
  - Body: `moderation_status` (`pending|approved|rejected|archived`), `verification_status` (`unverified|verified|disputed`), optional `moderator_note`.
- **`POST /api/community/reports/expire`** — Archives expired reports.
- **`DELETE /api/community/reports/{id}`** — Deletes report (owner-enforced when linked to a user).

## 11. Weather Alerts & Advisories
- **`GET /api/alerts?city={name}`** (also accepts `latitude`+`longitude`, optional `area`)
  - Clearly separates `official_alerts` (with `official_feed_status`: `"available"` or `"unavailable"`), `advisories` (`is_official: false`), and approved nearby `community_reports`.
- **`POST /api/alerts`**
  - Stores normalized official alert (`source`, `alert_type`, `severity`, `area`, `headline`, optional coordinates/timestamps).

## 12. Authentication, Preferences & Saved Locations
- **`POST /api/auth/register`** — `{"username", "email", "password"}` → returns `{user, token}`.
- **`POST /api/auth/login`** — `{"identifier" (or username/email), "password"}` → returns `{user, token}`.
- **`GET /api/auth/me`** (Bearer token required) — Returns current user.
- **`GET` / `PUT /api/preferences`** (Bearer token required) — `temperature_unit` (`celsius|fahrenheit`), `wind_speed_unit` (`kmh|mph`), `notifications_on` (boolean), `comfort_preference` (`normal|cold_sensitive|heat_sensitive`).
- **`GET` / `POST /api/saved-locations`** and **`DELETE /api/saved-locations/{id}`** (Bearer token required, strictly isolated per user).
