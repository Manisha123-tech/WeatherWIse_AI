"""GET /api/compare?cities=Ranchi,Delhi,Mumbai and POST /api/compare."""
from flask import Blueprint, request

from services import compare_service
from utils.responses import success_response

compare_bp = Blueprint("compare", __name__)


@compare_bp.route("/api/compare", methods=["GET", "POST"])
def compare():
    if request.method == "POST":
        specs = compare_service.parse_location_specs(request.get_json(silent=True))
        result = compare_service.compare_location_specs(specs)
        return success_response(result)

    city_names = compare_service.parse_city_list(request.args.get("cities"))
    result = compare_service.compare_cities(city_names)
    return success_response(result)
