"""Weather-aware travel analysis across origin, destination and optional waypoints."""
from datetime import datetime, timedelta

from services import assistant_service, open_meteo, weather_formatter
from utils.responses import ApiError


def _parse_location_input(value, field_name):
    if isinstance(value, str) and value.strip():
        return value.strip(), None, None
    if isinstance(value, dict):
        city = value.get("city") or value.get("name")
        lat = value.get("latitude")
        lon = value.get("longitude")
        if isinstance(city, str) and city.strip():
            return city.strip(), None, None
        if lat is not None and lon is not None:
            return None, lat, lon
    raise ApiError(
        "INVALID_REQUEST",
        f"'{field_name}' must be a city name or an object with 'city' or 'latitude'/'longitude'.",
        400,
    )


def _parse_departure(departure_text):
    if not isinstance(departure_text, str) or len(departure_text.strip()) < 13:
        raise ApiError(
            "INVALID_REQUEST",
            "'departure_time' must be an ISO datetime like '2026-11-25T15:00'.",
            400,
        )
    text = departure_text.strip().rstrip("Z")
    try:
        return datetime.fromisoformat(text[:16])
    except ValueError:
        raise ApiError(
            "INVALID_REQUEST",
            "'departure_time' must be a valid ISO datetime like '2026-11-25T15:00'.",
            400,
        )


def _pick_closest_hour(hourly_items, target_dt):
    if not hourly_items:
        return None
    target_key = target_dt.strftime("%Y-%m-%dT%H:00")
    best = None
    best_diff = None
    for item in hourly_items:
        time_str = item.get("time")
        if not isinstance(time_str, str) or len(time_str) < 13:
            continue
        try:
            item_dt = datetime.fromisoformat(time_str[:16])
        except ValueError:
            continue
        diff = abs((item_dt - target_dt).total_seconds())
        if best is None or diff < best_diff:
            best = item
            best_diff = diff
        if time_str[:13] == target_key[:13]:
            return item
    return best


def _evaluate_checkpoint(label, loc_input, target_dt):
    city, lat, lon = _parse_location_input(loc_input, label)
    location, raw = open_meteo.get_location_and_forecast(city, lat, lon)
    hourly = weather_formatter.format_hourly(raw, 168)
    matched = _pick_closest_hour(hourly, target_dt)
    if matched is None:
        return {
            "role": label,
            "location": location,
            "target_time": target_dt.strftime("%Y-%m-%dT%H:%M"),
            "forecast_available": False,
            "conditions": None,
        }
    return {
        "role": label,
        "location": location,
        "target_time": target_dt.strftime("%Y-%m-%dT%H:%M"),
        "forecast_available": True,
        "conditions": matched,
    }


def analyze_travel(body):
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    departure_dt = _parse_departure(body.get("departure_time"))

    duration_hours = body.get("estimated_duration_hours", 3)
    if isinstance(duration_hours, bool):
        raise ApiError("INVALID_REQUEST", "'estimated_duration_hours' must be a number.", 400)
    try:
        duration_val = float(duration_hours)
    except (TypeError, ValueError):
        raise ApiError("INVALID_REQUEST", "'estimated_duration_hours' must be a number.", 400)
    if not (0 < duration_val <= 72):
        raise ApiError("INVALID_REQUEST", "'estimated_duration_hours' must be between 0 and 72.", 400)

    waypoints = body.get("waypoints") or []
    if not isinstance(waypoints, list) or len(waypoints) > 3:
        raise ApiError("INVALID_REQUEST", "'waypoints' must be a list of at most 3 locations.", 400)

    checkpoints = []
    checkpoints.append(_evaluate_checkpoint("origin", body.get("origin"), departure_dt))

    if waypoints:
        step = duration_val / (len(waypoints) + 1)
        for idx, wp in enumerate(waypoints, start=1):
            wp_dt = departure_dt + timedelta(hours=step * idx)
            checkpoints.append(_evaluate_checkpoint(f"waypoint_{idx}", wp, wp_dt))

    arrival_dt = departure_dt + timedelta(hours=duration_val)
    checkpoints.append(_evaluate_checkpoint("destination", body.get("destination"), arrival_dt))

    available = [c for c in checkpoints if c["forecast_available"] and c["conditions"]]
    temps = [c["conditions"]["temperature"] for c in available if c["conditions"].get("temperature") is not None]
    probs = [c["conditions"]["precipitation_probability"] for c in available if c["conditions"].get("precipitation_probability") is not None]
    winds = [c["conditions"]["wind_speed"] for c in available if c["conditions"].get("wind_speed") is not None]
    codes = [c["conditions"]["weather_code"] for c in available]

    thunder = any(c in assistant_service.THUNDER_CODES for c in codes)
    heavy_rain = any(c in assistant_service.HEAVY_RAIN_CODES for c in codes)
    fog = any(c in assistant_service.FOG_CODES for c in codes)

    suggestions = []
    if thunder:
        suggestions.append("Thunderstorms are forecast along the planned window; consider delaying departure if possible.")
    if heavy_rain or (probs and max(probs) >= assistant_service.RAIN_CHANCE_HIGH):
        suggestions.append("Significant rain is possible; allow extra travel time and pack waterproof gear.")
    if fog:
        suggestions.append("Fog is indicated in the forecast; prepare for reduced visibility.")
    if winds and max(winds) >= assistant_service.STRONG_WIND_KMH:
        suggestions.append("Strong winds are forecast; use caution on exposed roads.")
    if not suggestions and available:
        suggestions.append("No major weather hazards are indicated in the sampled forecast checkpoints; recheck conditions shortly before departure.")
    if len(available) < len(checkpoints):
        suggestions.append("Forecast data was unavailable for one or more checkpoints; verify local conditions separately.")

    return {
        "departure_time": departure_dt.strftime("%Y-%m-%dT%H:%M"),
        "estimated_arrival_time": arrival_dt.strftime("%Y-%m-%dT%H:%M"),
        "route_geometry_available": False,
        "safety_claim": None,
        "data_coverage": {
            "checkpoints_requested": len(checkpoints),
            "checkpoints_with_forecast": len(available),
        },
        "summary": {
            "temperature_min": min(temps, default=None),
            "temperature_max": max(temps, default=None),
            "rain_probability_max": max(probs, default=None),
            "wind_speed_max": max(winds, default=None),
            "thunderstorm_indicated": thunder,
            "heavy_rain_indicated": heavy_rain,
            "fog_indicated": fog,
        },
        "checkpoints": checkpoints,
        "suggestions": suggestions,
        "uncertainty_note": (
            "Open-Meteo provides weather forecasts at specific coordinates/times and does not calculate road routes or traffic. "
            "This summary does not certify route safety."
        ),
    }
