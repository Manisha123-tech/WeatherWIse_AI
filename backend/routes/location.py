"""GET /api/location?q=Ranchi - search for places by name."""
from flask import Blueprint, request

from services import open_meteo
from utils.responses import ApiError, success_response

location_bp = Blueprint("location", __name__)


@location_bp.route("/api/location", methods=["GET"])
def search_location():
    query = request.args.get("q", "")

    count_text = request.args.get("count", "10")
    try:
        count = int(count_text)
    except ValueError:
        raise ApiError("INVALID_REQUEST", "'count' must be a whole number.", 400)
    if count < 1 or count > 20:
        raise ApiError("INVALID_REQUEST", "'count' must be between 1 and 20.", 400)

    locations = open_meteo.search_locations(query, count)

    return success_response({
        "query": query.strip(),
        "count": len(locations),
        "locations": locations,
    })
