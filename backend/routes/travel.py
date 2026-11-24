"""POST /api/travel/analyze - weather-based travel planner."""
from flask import Blueprint, request

from services import travel_service
from utils.responses import success_response

travel_bp = Blueprint("travel", __name__)


@travel_bp.route("/api/travel/analyze", methods=["POST"])
def analyze_travel():
    result = travel_service.analyze_travel(request.get_json(silent=True))
    return success_response(result)
