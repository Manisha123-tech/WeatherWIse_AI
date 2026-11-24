"""Saved locations routes: GET/POST /api/saved-locations and DELETE by id."""
from flask import Blueprint, request

from services import auth_service, preferences_service
from utils.responses import success_response

saved_locations_bp = Blueprint("saved_locations", __name__)


@saved_locations_bp.route("/api/saved-locations", methods=["GET", "POST"])
def saved_locations():
    user = auth_service.require_user()
    if request.method == "POST":
        created = preferences_service.add_saved_location(
            user["id"], request.get_json(silent=True)
        )
        return success_response(created, 201)

    items = preferences_service.list_saved_locations(user["id"])
    return success_response({"count": len(items), "locations": items})


@saved_locations_bp.route("/api/saved-locations/<int:location_id>", methods=["DELETE"])
def delete_saved_location(location_id):
    user = auth_service.require_user()
    result = preferences_service.delete_saved_location(user["id"], location_id)
    return success_response(result)
