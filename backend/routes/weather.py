"""GET /api/weather and GET /api/forecast."""
from flask import Blueprint, request

from services import open_meteo, weather_formatter
from utils.responses import ApiError, success_response

weather_bp = Blueprint("weather", __name__)


def read_hours():
    """Read the optional ?hours= value (1 to 168, default 24)."""
    hours_text = request.args.get("hours", "24")
    try:
        hours = int(hours_text)
    except ValueError:
        raise ApiError("INVALID_REQUEST", "'hours' must be a whole number.", 400)
    if hours < 1 or hours > 168:
        raise ApiError("INVALID_REQUEST", "'hours' must be between 1 and 168.", 400)
    return hours


def _read_refresh_flag():
    return request.args.get("refresh", "false").lower() in ("1", "true", "yes")


def _build_metadata(meta):
    info = {
        "source": "open-meteo",
        "fetched_at": meta["updated_at"],
        "cached": meta["cached"],
        "stale": meta["stale"],
    }
    if meta.get("expires_at"):
        info["cache_expires_at"] = meta["expires_at"]
    if meta.get("warning"):
        info["warning"] = meta["warning"]
    return info


@weather_bp.route("/api/weather", methods=["GET"])
def current_weather():
    location, raw, meta = open_meteo.get_location_and_forecast_with_meta(
        request.args.get("city"),
        request.args.get("latitude"),
        request.args.get("longitude"),
        refresh=_read_refresh_flag(),
    )

    payload = {
        "location": location,
        "current": weather_formatter.format_current(raw),
        "today": weather_formatter.format_today(raw),
        "units": weather_formatter.build_units(raw),
    }
    payload.update(_build_metadata(meta))
    return success_response(payload)


@weather_bp.route("/api/forecast", methods=["GET"])
def forecast():
    hours = read_hours()
    location, raw, meta = open_meteo.get_location_and_forecast_with_meta(
        request.args.get("city"),
        request.args.get("latitude"),
        request.args.get("longitude"),
        refresh=_read_refresh_flag(),
    )

    payload = {
        "location": location,
        "hourly": weather_formatter.format_hourly(raw, hours),
        "daily": weather_formatter.format_daily(raw),
        "units": weather_formatter.build_units(raw),
    }
    payload.update(_build_metadata(meta))
    return success_response(payload)
