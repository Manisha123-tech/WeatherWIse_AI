"""Authentication routes: register, login and current user profile."""
from flask import Blueprint, request

from services import auth_service
from utils.responses import ApiError, success_response

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)
    result = auth_service.register_user(
        body.get("username"),
        body.get("email"),
        body.get("password"),
    )
    return success_response(result, 201)


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)
    identifier = body.get("identifier") or body.get("username") or body.get("email")
    result = auth_service.authenticate_user(identifier, body.get("password"))
    return success_response(result)


@auth_bp.route("/api/auth/me", methods=["GET"])
def me():
    user = auth_service.require_user()
    return success_response({"user": user})
