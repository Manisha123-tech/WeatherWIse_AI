"""User preferences routes: GET and PUT /api/preferences."""
from flask import Blueprint, request

from services import auth_service, preferences_service
from utils.responses import success_response

preferences_bp = Blueprint("preferences", __name__)


@preferences_bp.route("/api/preferences", methods=["GET", "PUT"])
def user_preferences():
    user = auth_service.require_user()
    if request.method == "PUT":
        updated = preferences_service.update_preferences(
            user["id"], request.get_json(silent=True)
        )
        return success_response(updated)

    return success_response(preferences_service.get_preferences(user["id"]))
