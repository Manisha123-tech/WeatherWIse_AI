"""Talks to the Open-Meteo Geocoding and Forecast APIs (no API key needed)."""
import math

from flask import current_app, has_app_context
import requests

from services import cache_service
from utils.responses import ApiError

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
REQUEST_TIMEOUT_SECONDS = 10

CURRENT_FIELDS = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,"
    "precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl"
)
HOURLY_FIELDS = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,"
    "precipitation_probability,precipitation,weather_code,wind_speed_10m"
)
DAILY_FIELDS = (
    "weather_code,temperature_2m_max,temperature_2m_min,"
    "apparent_temperature_max,apparent_temperature_min,sunrise,sunset,"
    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max"
)


def _is_cache_enabled():
    if not has_app_context():
        return False
    if "CACHE_ENABLED" in current_app.config:
        return bool(current_app.config["CACHE_ENABLED"])
    return not bool(current_app.config.get("TESTING", False))


def _cache_ttl(kind):
    if not has_app_context():
        return 900
    if kind == "geocoding":
        return int(current_app.config.get("GEOCODING_CACHE_TTL_SECONDS", 86400))
    return int(current_app.config.get("FORECAST_CACHE_TTL_SECONDS", 900))


def _get_json(url, params):
    """Call an Open-Meteo URL and return its JSON, or raise a clean ApiError."""
    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.exceptions.Timeout:
        raise ApiError("UPSTREAM_TIMEOUT",
                       "The weather service took too long to respond.", 504)
    except requests.exceptions.RequestException:
        raise ApiError("UPSTREAM_UNAVAILABLE",
                       "Could not reach the weather service.", 502)

    if response.status_code != 200:
        raise ApiError("UPSTREAM_ERROR",
                       "The weather service returned an error.", 502)

    try:
        payload = response.json()
    except ValueError:
        raise ApiError("UPSTREAM_ERROR",
                       "The weather service sent an unreadable response.", 502)

    if not isinstance(payload, dict):
        raise ApiError("UPSTREAM_ERROR",
                       "The weather service sent an unexpected response.", 502)
    return payload


def _get_json_cached(cache_key, url, params, ttl_kind, refresh=False):
    """Fetch JSON from Open-Meteo with optional SQLite caching and stale fallback."""
    use_cache = _is_cache_enabled()
    cached_payload, cached_meta = (None, None)
    if use_cache:
        cached_payload, cached_meta = cache_service.get_cached(cache_key)
        if cached_payload is not None and not refresh and not cached_meta["stale"]:
            return cached_payload, cached_meta

    try:
        payload = _get_json(url, params)
    except ApiError:
        if use_cache and cached_payload is not None:
            stale_meta = dict(cached_meta)
            stale_meta["stale"] = True
            stale_meta["warning"] = (
                "Showing cached data because the live weather provider could not be reached."
            )
            return cached_payload, stale_meta
        raise

    if use_cache:
        meta = cache_service.set_cached(
            cache_key, params, payload, _cache_ttl(ttl_kind)
        )
    else:
        meta = {
            "cached": False,
            "stale": False,
            "updated_at": cache_service.to_iso(cache_service.utc_now()),
            "expires_at": None,
        }
    return payload, meta


def _display_name(item):
    """Build a label like 'Ranchi, Jharkhand, India'."""
    parts = []
    for key in ["name", "admin1", "country"]:
        value = item.get(key)
        if value and value not in parts:
            parts.append(value)
    return ", ".join(parts)


def format_location(item):
    """Turn one geocoding result into our own consistent shape."""
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "display_name": _display_name(item),
        "admin1": item.get("admin1"),
        "admin2": item.get("admin2"),
        "country": item.get("country"),
        "country_code": item.get("country_code"),
        "latitude": item.get("latitude"),
        "longitude": item.get("longitude"),
        "elevation": item.get("elevation"),
        "timezone": item.get("timezone"),
        "population": item.get("population"),
        "feature_code": item.get("feature_code"),
        "postcodes": item.get("postcodes"),
    }


def search_locations(query, count=10, refresh=False):
    """Search cities, towns, villages and localities by name."""
    query = (query or "").strip()
    if len(query) < 2:
        raise ApiError("INVALID_REQUEST",
                       "Search text 'q' must be at least 2 characters.", 400)

    params = {
        "name": query,
        "count": count,
        "language": "en",
        "format": "json",
    }
    cache_key = f"geocode:{query.lower()}:{count}"
    data, _ = _get_json_cached(
        cache_key, GEOCODING_URL, params, "geocoding", refresh=refresh
    )

    results = data.get("results")
    if not results or not isinstance(results, list):
        raise ApiError("LOCATION_NOT_FOUND",
                       "No location found for '" + query + "'.", 404)

    locations = []
    for item in results:
        if isinstance(item, dict):
            locations.append(format_location(item))
    if not locations:
        raise ApiError("LOCATION_NOT_FOUND",
                       "No location found for '" + query + "'.", 404)
    return locations


def parse_coordinates(latitude_text, longitude_text):
    """Check that latitude and longitude are valid finite numbers in range."""
    if isinstance(latitude_text, bool) or isinstance(longitude_text, bool):
        raise ApiError("INVALID_REQUEST",
                       "'latitude' and 'longitude' must be numbers.", 400)

    try:
        latitude = float(latitude_text)
        longitude = float(longitude_text)
    except (TypeError, ValueError):
        raise ApiError("INVALID_REQUEST",
                       "'latitude' and 'longitude' must be numbers.", 400)

    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise ApiError("INVALID_REQUEST",
                       "'latitude' and 'longitude' must be finite numbers.", 400)

    if not (-90 <= latitude <= 90):
        raise ApiError("INVALID_REQUEST",
                       "'latitude' must be between -90 and 90.", 400)
    if not (-180 <= longitude <= 180):
        raise ApiError("INVALID_REQUEST",
                       "'longitude' must be between -180 and 180.", 400)
    return latitude, longitude


def resolve_location(city, latitude_text, longitude_text, refresh=False):
    """Find the place the user means: by city name, or by coordinates.

    If both are given, the city name wins.
    """
    if isinstance(city, str) and city.strip() != "":
        return search_locations(city, 1, refresh=refresh)[0]

    if latitude_text is not None and longitude_text is not None:
        latitude, longitude = parse_coordinates(latitude_text, longitude_text)
        return format_location({
            "latitude": latitude,
            "longitude": longitude,
        })

    raise ApiError("INVALID_REQUEST",
                   "Provide 'city', or both 'latitude' and 'longitude'.", 400)


def fetch_forecast_with_meta(latitude, longitude, refresh=False):
    """Get current, hourly and daily weather for one point with cache metadata."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": CURRENT_FIELDS,
        "hourly": HOURLY_FIELDS,
        "daily": DAILY_FIELDS,
        "timezone": "auto",
        "forecast_days": 7,
    }
    cache_key = f"forecast:{round(float(latitude), 4)}:{round(float(longitude), 4)}"
    data, meta = _get_json_cached(
        cache_key, FORECAST_URL, params, "forecast", refresh=refresh
    )

    for section in ["current", "hourly", "daily"]:
        if not isinstance(data.get(section), dict):
            raise ApiError("UPSTREAM_ERROR",
                           "The weather service sent incomplete data.", 502)
    return data, meta


def fetch_forecast(latitude, longitude):
    """Get current, hourly and daily weather for one point."""
    data, _ = fetch_forecast_with_meta(latitude, longitude)
    return data


def get_location_and_forecast_with_meta(city, latitude_text, longitude_text, refresh=False):
    """Resolve location and fetch forecast along with freshness/cache metadata."""
    location = resolve_location(city, latitude_text, longitude_text, refresh=refresh)
    raw, meta = fetch_forecast_with_meta(
        location["latitude"], location["longitude"], refresh=refresh
    )
    location["timezone"] = raw.get("timezone") or location.get("timezone")
    return location, raw, meta


def get_location_and_forecast(city, latitude_text, longitude_text):
    """One call used by the routes: find the place, then get its weather."""
    location, raw, _ = get_location_and_forecast_with_meta(
        city, latitude_text, longitude_text
    )
    return location, raw


def get_location_and_air_quality_with_meta(city, latitude_text, longitude_text, refresh=False):
    """Resolve location and fetch current air quality (US AQI, PM2.5, PM10) with cache metadata."""
    location = resolve_location(city, latitude_text, longitude_text, refresh=refresh)
    lat, lon = location["latitude"], location["longitude"]
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "us_aqi,pm2_5,pm10",
        "timezone": "auto",
    }
    cache_key = f"aqi:{round(float(lat), 4)}:{round(float(lon), 4)}"
    data, meta = _get_json_cached(
        cache_key, AIR_QUALITY_URL, params, "forecast", refresh=refresh
    )
    current = data.get("current")
    if not isinstance(current, dict):
        raise ApiError("UPSTREAM_ERROR", "The air quality service sent incomplete data.", 502)
    location["timezone"] = data.get("timezone") or location.get("timezone")
    air_quality = {
        "us_aqi": current.get("us_aqi"),
        "pm2_5": current.get("pm2_5"),
        "pm10": current.get("pm10"),
        "time": current.get("time"),
    }
    return location, air_quality, meta
