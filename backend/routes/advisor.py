"""Routes for rain arrival estimator and clothing/comfort advisor."""
from flask import Blueprint, request

from services import clothing_advisor, open_meteo, rain_estimator
from utils.responses import ApiError, success_response

advisor_bp = Blueprint("advisor", __name__)


def _read_hours(raw_hours, default=24):
    if raw_hours is None:
        return default
    if isinstance(raw_hours, bool):
        raise ApiError("INVALID_REQUEST", "'hours' must be a whole number.", 400)
    try:
        hours = int(raw_hours)
    except (TypeError, ValueError):
        raise ApiError("INVALID_REQUEST", "'hours' must be a whole number.", 400)
    if hours < 1 or hours > 168:
        raise ApiError("INVALID_REQUEST", "'hours' must be between 1 and 168.", 400)
    return hours


@advisor_bp.route("/api/rain-estimate", methods=["GET"])
def rain_estimate():
    hours = _read_hours(request.args.get("hours"), default=24)
    location, raw = open_meteo.get_location_and_forecast(
        request.args.get("city"),
        request.args.get("latitude"),
        request.args.get("longitude"),
    )
    return success_response(rain_estimator.estimate_rain(location, raw, hours=hours))


@advisor_bp.route("/api/advisor/clothing", methods=["GET", "POST"])
def clothing_advice():
    if request.method == "POST":
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)
        city = body.get("city")
        if city is not None and not isinstance(city, str):
            raise ApiError("INVALID_REQUEST", "'city' must be text.", 400)
        lat = body.get("latitude")
        lon = body.get("longitude")
        hours = _read_hours(body.get("hours"), default=12)
        comfort = body.get("comfort_preference", "normal")
        unit = body.get("temperature_unit", "celsius")
    else:
        city = request.args.get("city")
        lat = request.args.get("latitude")
        lon = request.args.get("longitude")
        hours = _read_hours(request.args.get("hours"), default=12)
        comfort = request.args.get("comfort_preference", "normal")
        unit = request.args.get("temperature_unit", "celsius")

    location, raw = open_meteo.get_location_and_forecast(city, lat, lon)
    return success_response(
        clothing_advisor.advise_clothing(
            location,
            raw,
            hours=hours,
            comfort_preference=comfort,
            temperature_unit=unit,
        )
    )
