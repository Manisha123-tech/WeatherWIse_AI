"""POST /api/assistant and POST /api/assistant/recommend."""
from flask import Blueprint, request

from services import assistant_service, open_meteo
from utils.responses import ApiError, success_response

assistant_bp = Blueprint("assistant", __name__)


@assistant_bp.route("/api/assistant", methods=["POST"])
@assistant_bp.route("/api/assistant/recommend", methods=["POST"])
def assistant():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST",
                       "Send a JSON body like {\"question\": \"...\", \"city\": \"Ranchi\"}.",
                       400)

    question = assistant_service.validate_question(body.get("question"))

    city = body.get("city")
    if city is not None and not isinstance(city, str):
        raise ApiError("INVALID_REQUEST", "'city' must be text.", 400)

    preferences = body.get("preferences")
    if preferences is not None and not isinstance(preferences, dict):
        raise ApiError("INVALID_REQUEST", "'preferences' must be an object.", 400)

    location, raw = open_meteo.get_location_and_forecast(
        city, body.get("latitude"), body.get("longitude"))

    return success_response(
        assistant_service.ask_assistant(question, location, raw, preferences=preferences)
    )
