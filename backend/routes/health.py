"""Health check endpoint."""
from flask import Blueprint, jsonify

from database.db import get_db

health_bp = Blueprint("health", __name__)


@health_bp.route("/api/health", methods=["GET"])
def health_check():
    """Tell the caller that the server and database are working."""
    database_status = "connected"
    try:
        get_db().execute("SELECT 1")
    except Exception:
        database_status = "error"

    status_code = 200
    status = "ok"
    if database_status == "error":
        status_code = 500
        status = "error"

    return jsonify({
        "status": status,
        "service": "WeatherWise AI backend",
        "database": database_status,
    }), status_code
