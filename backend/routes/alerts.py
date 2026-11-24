"""Weather alerts & advisories routes."""
from flask import Blueprint, request

from services import alert_service
from utils.responses import success_response

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("/api/alerts", methods=["GET", "POST"])
def alerts():
    if request.method == "POST":
        stored = alert_service.store_official_alert(request.get_json(silent=True))
        return success_response(stored, 201)

    result = alert_service.get_alerts(
        city=request.args.get("city"),
        latitude=request.args.get("latitude"),
        longitude=request.args.get("longitude"),
        area=request.args.get("area"),
    )
    return success_response(result)
