"""Accuracy tracker routes: snapshots, observations, and metrics."""
from flask import Blueprint, request

from services import accuracy_service
from utils.responses import success_response

accuracy_bp = Blueprint("accuracy", __name__)


@accuracy_bp.route("/api/accuracy/snapshots", methods=["POST"])
def save_snapshot():
    result = accuracy_service.create_snapshot(request.get_json(silent=True))
    return success_response(result, 201)


@accuracy_bp.route("/api/accuracy/observations", methods=["POST"])
def save_observation():
    result = accuracy_service.record_observation(request.get_json(silent=True))
    return success_response(result, 201)


@accuracy_bp.route("/api/accuracy", methods=["GET"])
@accuracy_bp.route("/api/accuracy/metrics", methods=["GET"])
def get_accuracy_metrics():
    result = accuracy_service.compute_metrics(
        location_key=request.args.get("location_key"),
        city=request.args.get("city"),
        latitude=request.args.get("latitude"),
        longitude=request.args.get("longitude"),
    )
    return success_response(result)
