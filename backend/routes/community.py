"""Community weather report routes with moderation and verification."""
from flask import Blueprint, request

from services import auth_service, community_service
from utils.responses import success_response

community_bp = Blueprint("community", __name__)


@community_bp.route("/api/community/reports", methods=["GET", "POST"])
def community_reports():
    if request.method == "POST":
        user = auth_service.get_optional_user()
        report = community_service.create_report(request.get_json(silent=True), user=user)
        return success_response(report, 201)

    include_expired = request.args.get("include_expired", "false").lower() in ("1", "true", "yes")
    reports = community_service.list_reports(
        status=request.args.get("status", "approved"),
        verification_status=request.args.get("verification_status"),
        category=request.args.get("category"),
        include_expired=include_expired,
        latitude=request.args.get("latitude"),
        longitude=request.args.get("longitude"),
        radius_km=request.args.get("radius_km", 50.0),
    )
    return success_response({"count": len(reports), "reports": reports})


@community_bp.route("/api/community/reports/<int:report_id>/moderate", methods=["PATCH"])
def moderate_community_report(report_id):
    updated = community_service.moderate_report(report_id, request.get_json(silent=True))
    return success_response(updated)


@community_bp.route("/api/community/reports/expire", methods=["POST"])
def expire_community_reports():
    result = community_service.archive_expired_reports()
    return success_response(result)


@community_bp.route("/api/community/reports/<int:report_id>", methods=["DELETE"])
def delete_community_report(report_id):
    user = auth_service.get_optional_user()
    result = community_service.delete_report(report_id, user=user)
    return success_response(result)
